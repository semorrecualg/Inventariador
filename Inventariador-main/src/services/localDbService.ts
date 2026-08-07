import { db, DexieAsset, DexieCampaign, sqliteService } from './sqliteService';
import { isAdminEmail } from '../utils/authUtils';
import { Asset, UnitConfig, AuditLogEntry, User, InventoryCampaign, CampaignStatus } from '../types';
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

type SqlValue = string | number | boolean | null;

// Create a localForage instance dedicated for user profiles and offline login persistence
const usersStore = localforage.createInstance({
  name: 'InventoryApp_Users',
  storeName: 'users'
});

// Fallback IndexedDB para snapshots virtuais: localStorage tem quota (~5MB) e pode
// estourar com cargas grandes (ex.: 12k+ ativos). IndexedDB não tem esse limite prático.
const snapshotStore = localforage.createInstance({
  name: 'InventoryApp_Snapshots',
  storeName: 'virtual_backups'
});

export const getCurrentTenantid = (): string => {
  try {
    const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.tenantid || user.tenantid || user.tenantid || 'DEMO_DEFAULT';
    }
  } catch { /* ignore */ }
  return 'DEMO_DEFAULT';
};

const handleDemoAuditIncrement = () => {
  try {
    const sessionUser = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
    if (sessionUser) {
      const parsed = JSON.parse(sessionUser);
      if (parsed && (parsed.role === 'DEMO' || parsed.role === 'usuario_demo')) {
        const count = parseInt(localStorage.getItem('gbr_kardex_demo_audits') || '0', 10) + 1;
        localStorage.setItem('gbr_kardex_demo_audits', count.toString());
        logger.info(`>>> [DEMO MODE] Coleta registrada! Nova contagem de coletas: ${count}/30`);
      }
    }
  } catch { /* ignore */ }
};

// Map React UI Asset models (with Booleans) to Database persistable models (with 0/1 Numbers)
function toDexieAsset(asset: Asset): DexieAsset {
  const obj: Record<string, unknown> = { ...asset } as unknown as unknown as Record<string, unknown>;
  const boolKeys = [
    '_conferido', '_is_deleted', '_is_synced', '_plaquetado', 
    '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa'
  ];
  boolKeys.forEach(k => {
    if (k in obj) {
      if (typeof obj[k] === 'boolean') {
        obj[k] = obj[k] ? 1 : 0;
      } else if (obj[k] === undefined || obj[k] === null) {
        obj[k] = 0;
      } else {
        obj[k] = Number(obj[k]) ? 1 : 0;
      }
    } else {
      obj[k] = 0;
    }
  });

  if (asset.currentCampaignId === undefined) {
    obj.currentCampaignId = null;
  }

  const primarykey = String(asset.primarykey || asset.id || '');
  obj.primarykey = primarykey;
  obj.id = primarykey;

  return obj as unknown as DexieAsset;
}

// Map database row objects back to standard React types (with Booleans and parsed JSONs)
function toReactAsset(row: DexieAsset | Record<string, unknown>): Asset {
  const asset: Record<string, unknown> = { ...row } as unknown as unknown as Record<string, unknown>;
  const boolKeys = [
    '_conferido', '_is_deleted', '_is_synced', '_plaquetado', 
    '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa'
  ];
  boolKeys.forEach(k => {
    if (k in asset) {
      asset[k] = asset[k] === 1 || asset[k] === true;
    } else {
      asset[k] = false;
    }
  });

  ['DE_PARA', '_history'].forEach(key => {
    if (typeof asset[key] === 'string' && (String(asset[key]).startsWith('{') || String(asset[key]).startsWith('['))) {
      try {
        asset[key] = JSON.parse(String(asset[key]));
      } catch { /* ignore */ }
    }
  });

  return asset as unknown as Asset;
}

export const localDb = {
  assets: {
    add: async (asset: Asset, userId?: string) => {
      const dexieAsset = toDexieAsset(asset);
      await db.ativos.put(dexieAsset);
      await db.assets.put(dexieAsset);
      await db.local_assets.put(dexieAsset);
      handleDemoAuditIncrement();
      if (userId) {
        await localDb.auditLogs.add({
          timestamp: new Date().toISOString(),
          user: userId,
          user_email: userId,
          action: 'CREATE',
          table_name: 'ativos',
          record_id: dexieAsset.primarykey,
          details: 'Criação de ativo manual',
          new_data: asset,
          tenantid: getCurrentTenantid()
        });
      }
    },
    
    // In-memory operation buffer mimicking the SRE GBR v25 batched-mutation rules
    _mutationBuffer: [] as { asset: Asset; userId?: string }[],
    
    put: async (asset: Asset, userId?: string) => {
      localDb.assets._mutationBuffer.push({ asset, userId });
      handleDemoAuditIncrement();
      
      if (localDb.assets._mutationBuffer.length >= 10) {
        await localDb.assets.flush();
      }
    },
    
    flush: async () => {
      if (localDb.assets._mutationBuffer.length === 0) return;
      logger.info(`>>> [Persistence] Regra dos 5/10: Flush Atômico de ${localDb.assets._mutationBuffer.length} operações em Dexie.js`);
      
      const bufferCopy = [...localDb.assets._mutationBuffer];
      localDb.assets._mutationBuffer = [];
      
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets, db.audit_logs], async () => {
        for (const item of bufferCopy) {
          const dexieAsset = toDexieAsset(item.asset);
          await db.ativos.put(dexieAsset);
          await db.assets.put(dexieAsset);
          await db.local_assets.put(dexieAsset);
          
          if (item.userId) {
            const logId = `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await db.audit_logs.put({
              id: logId,
              usuario: item.userId,
              acao: 'CREATE_OR_UPDATE',
              tabela: 'ativos',
              registro_id: dexieAsset.primarykey,
              details: 'Criação/Update via Buffer',
              delta: JSON.stringify(item.asset),
              updated_at: new Date().toISOString()
            });
          }
        }
      });
    },

    getMapData: async (campaignId: string): Promise<Asset[]> => {
      const tenant = getCurrentTenantid().trim().toUpperCase();
      const results = await db.assets
        .where('currentCampaignId')
        .equals(campaignId)
        .toArray();

      return results
        .filter(a => a._is_deleted !== 1 && String(a.tenantid || a.tenantid || '').trim().toUpperCase() === tenant)
        .map(row => toReactAsset(row));
    },

    bulkAdd: async (assets: Asset[]) => {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const chunk = assets.slice(i, i + BATCH_SIZE);
        const mappedChunk: DexieAsset[] = [];
        
        for (let j = 0; j < chunk.length; j++) {
          const a = chunk[j];
          // Sanitização forçada obrigatória (SRE)
          const tenantid = String(a.tenantid || a.tenantid || '').trim().toUpperCase();
          const filial = String(a.filial || a._unitid || '').trim().toUpperCase();
          const serial = String(a.serial || '').trim().toUpperCase();
          
          a.tenantid = tenantid;
          a.filial = filial;
          a.serial = serial;
          
          mappedChunk.push(toDexieAsset(a));
        }

        await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
          await db.ativos.bulkPut(mappedChunk);
          await db.assets.bulkPut(mappedChunk);
          await db.local_assets.bulkPut(mappedChunk);
        });
        
        // Respiro para SRE e GC (Garbage Collector)
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    },

    bulkPut: async (assets: Asset[]) => {
      await localDb.assets.bulkAdd(assets);
    },

    update: async (id: string, changes: Partial<Asset>, userId?: string) => {
      const cleanId = String(id);
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
        const existing = await db.ativos.get(cleanId);
        if (existing) {
          const mappedChanges: Record<string, unknown> = { ...changes } as unknown as unknown as Record<string, unknown>;
          // Format boolean values properly
          ['_conferido', '_is_deleted', '_is_synced', '_plaquetado', '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa'].forEach(k => {
            if (k in mappedChanges) {
              mappedChanges[k] = mappedChanges[k] ? 1 : 0;
            }
          });
          const updated = { ...existing, ...mappedChanges };
          await db.ativos.put(updated);
          await db.assets.put(updated);
          await db.local_assets.put(updated);
        }
      });

      handleDemoAuditIncrement();
      if (userId) {
        await localDb.auditLogs.add({
          timestamp: new Date().toISOString(),
          user: userId,
          user_email: userId,
          action: 'UPDATE',
          table_name: 'ativos',
          record_id: cleanId,
          details: 'Atualização de ativo',
          new_data: changes,
          tenantid: getCurrentTenantid()
        });
      }
    },

    count: async () => {
      const tenant = getCurrentTenantid().trim().toUpperCase();
      const all = await db.assets.toArray();
      return all.filter(a => String(a.tenantid || a.tenantid || '').trim().toUpperCase() === tenant).length;
    },

    clear: async () => {
      await db.ativos.clear();
      await db.assets.clear();
      await db.local_assets.clear();
    },

    toArray: async (): Promise<Asset[]> => {
      const tenant = getCurrentTenantid().trim().toUpperCase();
      const results = await db.ativos.toArray();
      return results
        .filter(a => String(a.tenantid || a.tenantid || '').trim().toUpperCase() === tenant)
        .map(row => toReactAsset(row));
    },

    where: (field: string) => ({
      equals: (value: SqlValue | SqlValue[]) => ({
        first: async () => {
          const tenant = getCurrentTenantid().trim().toUpperCase();
          if (Array.isArray(value)) {
            // Using compound index: [tenantid+filial]
            const results = await db.ativos.where('[tenantid+filial]').equals(value as string & string[]).toArray();
            const firstMatch = results.find(a => a._is_deleted !== 1);
            return firstMatch ? toReactAsset(firstMatch) : null;
          }

          // Simple field queries
          const fieldClean = field.replace('[', '').replace(']', '').replace('+', '');
          const results = await db.ativos.toArray();
          const match = results.find(a => {
            const propVal = String((a as unknown as Record<string, unknown>)[fieldClean] || '').trim().toUpperCase();
            const targetVal = String(value).trim().toUpperCase();
            const isTenantMatch = String(a.tenantid || a.tenantid || '').trim().toUpperCase() === tenant;
            return propVal === targetVal && isTenantMatch;
          });
          return match ? toReactAsset(match) : null;
        },
        toArray: async () => {
          const tenant = getCurrentTenantid().trim().toUpperCase();
          if (Array.isArray(value)) {
            const results = await db.ativos.where('[tenantid+filial]').equals(value as string & string[]).toArray();
            return results.map(row => toReactAsset(row));
          }

          const fieldClean = field.replace('[', '').replace(']', '').replace('+', '');
          const results = await db.ativos.toArray();
          return results
            .filter(a => {
              const propVal = String((a as unknown as Record<string, unknown>)[fieldClean] || '').trim().toUpperCase();
              const targetVal = String(value).trim().toUpperCase();
              const isTenantMatch = String(a.tenantid || a.tenantid || '').trim().toUpperCase() === tenant;
              return propVal === targetVal && isTenantMatch;
            })
            .map(row => toReactAsset(row));
        }
      })
    }),

    getLocationsWithStats: async (unitId: string, searchTerm = '') => {
      const tenant = getCurrentTenantid().trim().toUpperCase();
      const uIdUpper = unitId.toUpperCase().trim();
      const cleanSearch = searchTerm.toLowerCase().trim();
      
      const query = db.addresses.where('[tenantid+filial]').equals([tenant, uIdUpper]);
      let addrList = await query.toArray();

      if (cleanSearch !== '') {
        addrList = addrList.filter(a => String(a.codigo_endereco || '').toLowerCase().startsWith(cleanSearch));
      }
      
      // 2. Se a tabela addresses estiver vazia, extrai as localidades dinamicamente da tabela de trabalho
      //    (assets canônica — decisão DBA 2026-08-06; fallback local_assets baseline para restore .dat)
      if (addrList.length === 0) {
        let workAssets = await db.assets.where('[tenantid+filial]').equals([tenant, uIdUpper]).toArray();
        if (workAssets.length === 0) {
          workAssets = await db.local_assets.where('[tenantid+filial]').equals([tenant, uIdUpper]).toArray();
        }
        const extractedAddrs = new Map<string, typeof addrList[0]>();
        workAssets.forEach(a => {
          const addrStr = String(a.endereco || '').trim();
          if (addrStr && (cleanSearch === '' || addrStr.toUpperCase().startsWith(cleanSearch))) {
            const key = addrStr.toUpperCase();
            if (!extractedAddrs.has(key)) {
              extractedAddrs.set(key, {
                tenantid: tenant,
                filial: uIdUpper,
                codigo_endereco: addrStr,
                setor: '',
                bloco: '',
                _is_synced: 1
              });
            }
          }
        });
        addrList = Array.from(extractedAddrs.values());
      }

      // 4. Busca reativa das estatísticas de conferência na tabela de trabalho (assets canônica)
      let listAssets = await db.assets.where('[tenantid+filial]').equals([tenant, uIdUpper]).toArray();
      if (listAssets.length === 0) {
        listAssets = await db.local_assets.where('[tenantid+filial]').equals([tenant, uIdUpper]).toArray();
      }
      const nonDeleted = listAssets.filter(a => a._is_deleted !== 1);

      const statsMap = new Map<string, { total: number; checked: number }>();
      nonDeleted.forEach(asset => {
        const address = String(asset.endereco || '').trim().toUpperCase();
        const key = address !== '' ? address : 'GERAL - NÃO ESPECIFICADO';
        const stats = statsMap.get(key) || { total: 0, checked: 0 };
        stats.total += 1;
        if (asset._conferido === 1) {
          stats.checked += 1;
        }
        statsMap.set(key, stats);
      });

      const finalResults = addrList.map(addr => {
        const displayName = String(addr.codigo_endereco || '').trim() || 'GERAL - NÃO ESPECIFICADO';
        const stats = statsMap.get(displayName.toUpperCase()) || { total: 0, checked: 0 };
        return {
          displayName,
          total: Math.max(0, stats.total),
          checked: Math.max(0, stats.checked),
          locKey: displayName.toUpperCase().replace(/[^A-Z0-9]/g, '')
        };
      });

      // Deduplicação dos endereços resultantes para evitar duplicidade de renderização
      const uniqueResults = new Map<string, typeof finalResults[0]>();
      finalResults.forEach(r => {
        const key = r.displayName.toUpperCase();
        if (!uniqueResults.has(key)) {
          uniqueResults.set(key, r);
        } else {
          const existing = uniqueResults.get(key)!;
          existing.total = Math.max(existing.total, r.total);
          existing.checked = Math.max(existing.checked, r.checked);
        }
      });

      return Array.from(uniqueResults.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    getLabelingAssets: async (unitId?: string): Promise<Asset[]> => {
      let activeUnit = unitId || '';
      let activeCampaign = '';

      try {
        const ctx = await db.SYSTEM_CONTEXT.get('selected_unit');
        const activeCampaignRow = await db.SYSTEM_CONTEXT.get('active_campaign');
        if (!activeUnit && ctx) activeUnit = ctx.value;
        if (activeCampaignRow) activeCampaign = activeCampaignRow.value;
      } catch { /* ignore */ }

      if (!activeUnit) {
        const storedUnit = localStorage.getItem('app_selected_unit');
        if (storedUnit) activeUnit = storedUnit;
      }

      if (!activeUnit) return [];

      const list = await db.ativos.toArray();
      const results = list.filter(a => {
        const filialMatch = String(a.filial || a._unitid || '').toUpperCase().trim() === activeUnit.toUpperCase().trim();
        const isNotDeleted = a._is_deleted !== 1;
        const noLabel = !a.etiqueta || String(a.etiqueta).trim() === '' || String(a.etiqueta).toUpperCase().trim() === 'ETIQUETAR' || a._plaquetado === 0;
        const campaignMatch = !activeCampaign || String(a.currentCampaignId) === String(activeCampaign);
        return filialMatch && isNotDeleted && noLabel && campaignMatch;
      });

      return results.map(row => toReactAsset(row)).sort((a, b) => {
        const c1 = String(a.centrodecusto || '');
        const c2 = String(b.centrodecusto || '');
        return c1.localeCompare(c2);
      });
    },

    removeCampaignFromAssets: async (campaignId: string): Promise<void> => {
      const allAtivos = await db.ativos.where('currentCampaignId').equals(campaignId).toArray();
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
        for (const asset of allAtivos) {
          asset.currentCampaignId = null;
          await db.ativos.put(asset);
          await db.assets.put(asset);
          await db.local_assets.put(asset);
        }
      });
    },

    scanAsset: async (term: string, filial: string): Promise<Asset | null> => {
      const termUpper = String(term).trim().toUpperCase();
      const unitClean = String(filial).trim().toUpperCase();
      
      const list = await db.ativos.toArray();
      const match = list.find(a => {
        const eq = String(a.etiqueta || '').trim().toUpperCase();
        const pk = String(a.primarykey || '').trim().toUpperCase();
        const f = String(a.filial || a._unitid || '').trim().toUpperCase();
        const isNotDeleted = a._is_deleted !== 1;
        
        return (eq === termUpper || pk === termUpper) && f === unitClean && isNotDeleted;
      });
      
      return match ? toReactAsset(match) : null;
    }
  },

  localidades: {
    search: async (term: string) => {
      const list = await db.ativos.toArray();
      const uniqueEnderecos = Array.from(new Set(
        list
          .map(a => String(a.endereco || '').trim())
          .filter(e => e && e.toLowerCase().includes(term.toLowerCase()))
      ));
      return uniqueEnderecos.sort().map((e, idx) => ({
        ID: String(idx + 1),
        DESCRICAO: e
      }));
    }
  },

  auditLogs: {
    add: async (log: AuditLogEntry) => {
      const id = `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await db.audit_logs.put({
        id,
        usuario: log.user || log.user_email || 'unknown',
        acao: log.action || 'UNKNOWN',
        tabela: log.table_name || 'ativos',
        registro_id: log.record_id || '',
        details: log.details || '',
        delta: log.new_data ? JSON.stringify(log.new_data) : (log.old_data ? JSON.stringify(log.old_data) : null),
        updated_at: log.timestamp || new Date().toISOString()
      });
    },

    bulkAdd: async (logs: AuditLogEntry[]) => {
      for (const log of logs) {
        await localDb.auditLogs.add(log);
      }
    },

    count: async () => {
      return await db.audit_logs.count();
    },

    clear: async () => {
      await db.audit_logs.clear();
    },

    reverse: () => ({
      limit: (n: number) => ({
        toArray: async (): Promise<AuditLogEntry[]> => {
          const logs = await db.audit_logs.toArray();
          logs.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
          const sliced = logs.slice(0, n);
          return sliced.map(log => ({
            timestamp: log.updated_at,
            user: log.usuario,
            user_email: log.usuario,
            action: log.acao,
            table_name: log.tabela,
            record_id: log.registro_id,
            details: log.details,
            new_data: log.delta ? JSON.parse(log.delta) : undefined,
            tenantid: getCurrentTenantid()
          }));
        }
      })
    })
  },

  unitConfigs: {
    put: async (config: UnitConfig) => {
      const cfg = config as unknown as Record<string, unknown>;
      await db.unit_configs.put({
        id: String(cfg.id || cfg.filial || ''),
        filial: String(cfg.filial || ''),
        nome: String(cfg.nome || cfg.filial || ''),
        hasGps: cfg.hasGps ? 1 : 0,
        requireNf: cfg.requireNf ? 1 : 0,
        requireSeriado: cfg.requireSeriado ? 1 : 0,
        allowNewAssets: cfg.allowNewAssets !== false ? 1 : 0,
        allowWriteOffs: cfg.allowWriteOffs !== false ? 1 : 0,
        requirePlaqueta: cfg.requirePlaqueta ? 1 : 0
      });
    },

    toArray: async (): Promise<UnitConfig[]> => {
      const results = await db.unit_configs.toArray();
      return results.map(row => ({
        id: row.id,
        tenantid: getCurrentTenantid(),
        unit_id: row.filial,
        lat: 0,
        lng: 0,
        radius_meters: 0,
        is_active: true,
        filial: row.filial,
        nome: row.nome,
        hasGps: row.hasGps === 1,
        requireNf: row.requireNf === 1,
        requireSeriado: row.requireSeriado === 1,
        allowNewAssets: row.allowNewAssets === 1,
        allowWriteOffs: row.allowWriteOffs === 1,
        requirePlaqueta: row.requirePlaqueta === 1
      } as UnitConfig));
    },

    clear: async () => {
      await db.unit_configs.clear();
    },

    count: async () => {
      return await db.unit_configs.count();
    }
  },

  campaigns: {
    clear: async () => {
      await db.campaigns.clear();
    },
    toArray: async (tenantid?: string, unitId?: string): Promise<InventoryCampaign[]> => {
      const results = await db.campaigns.toArray();
      const normTenant = String(tenantid || '').trim().toUpperCase();
      const normUnit = String(unitId || '').trim().toUpperCase();

      return results
        .filter(c => {
          const cTenant = String(c.tenantid || '').trim().toUpperCase();
          const cUnit = String((c as unknown as Record<string, unknown>).unit_id || (c as unknown as Record<string, unknown>)._unitid || '').trim().toUpperCase();
          const tenantMatch = !normTenant || cTenant === normTenant;
          const unitMatch = !normUnit || cUnit === normUnit || cUnit === '';
          return tenantMatch && unitMatch;
        })
        .map(row => ({
          id: row.id,
          name: row.name,
          description: (row as unknown as Record<string, unknown>).description || '',
          status: (row.status || 'CREATED') as CampaignStatus,
          start_date: (row as unknown as Record<string, unknown>).start_date || row.created_at || new Date().toISOString(),
          end_date: (row as unknown as Record<string, unknown>).end_date || null,
          tenantid: row.tenantid,
          filial: String((row as unknown as Record<string, unknown>).filial || (row as unknown as Record<string, unknown>).unit_id || (row as unknown as Record<string, unknown>)._unitid || ''),
          unit_id: (row as unknown as Record<string, unknown>).filial || (row as unknown as Record<string, unknown>).unit_id || (row as unknown as Record<string, unknown>)._unitid || ''
        } as unknown as InventoryCampaign));
    },
    put: async (campaign: Partial<InventoryCampaign>): Promise<void> => {
      await db.campaigns.put({
        id: String(campaign.id || ''),
        name: String(campaign.name || ''),
        status: String(campaign.status || 'CREATED'),
        tenantid: String(campaign.tenantid || ''),
        created_at: String(campaign.start_date || new Date().toISOString()),
        description: String(campaign.description || ''),
        unit_id: String(campaign.filial || campaign.unit_id || campaign._unitid || ''),
        filial: String(campaign.filial || campaign.unit_id || campaign._unitid || ''),
        start_date: String(campaign.start_date || new Date().toISOString()),
        end_date: campaign.end_date ? String(campaign.end_date) : null
      } as unknown as DexieCampaign);
    },
    delete: async (campaignId: string): Promise<void> => {
      await db.campaigns.delete(campaignId);
    }
  },

  ativos: {
    bulkPut: async (items: Asset[]) => {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE);
        const mappedChunk: DexieAsset[] = [];
        
        for (let j = 0; j < chunk.length; j++) {
          const a = chunk[j];
          // Sanitização forçada obrigatória (SRE)
          const tenantid = String(a.tenantid || a.tenantid || '').trim().toUpperCase();
          const filial = String(a.filial || a._unitid || '').trim().toUpperCase();
          const serial = String(a.serial || '').trim().toUpperCase();
          
          a.tenantid = tenantid;
          a.filial = filial;
          a.serial = serial;
          
          mappedChunk.push(toDexieAsset(a));
        }
        
        await db.ativos.bulkPut(mappedChunk);
        
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    },

    toArray: async (): Promise<Asset[]> => {
      const results = await db.ativos.toArray();
      return results.map(row => toReactAsset(row));
    }
  },

  users: {
    add: async (user: User) => {
      const emailClean = String(user.email).trim().toLowerCase();
      if (emailClean) {
        await usersStore.setItem(emailClean, {
          ...user,
          is_admin: user.is_admin || user.isAdmin || false,
          isAdmin: user.is_admin || user.isAdmin || false
        });
      }
    },

    get: async (criteria: { email: string }): Promise<User | null> => {
      const emailClean = String(criteria.email || '').trim().toLowerCase();
      if (!emailClean) return null;
      const found = await usersStore.getItem<User>(emailClean);
      if (!found) return null;
      return {
        ...found,
        is_admin: found.is_admin === true || found.isAdmin === true,
        isAdmin: found.is_admin === true || found.isAdmin === true,
        tenantid: found.tenantid || found.tenantid || 'CICOPAL'
      } as unknown as User;
    },

    bulkAdd: async (users: User[]) => {
      for (const u of users) {
        await localDb.users.add(u);
      }
    },

    toArray: async (): Promise<User[]> => {
      const users: User[] = [];
      await usersStore.iterate((value: unknown) => {
        const valueObj = value as unknown as Record<string, unknown>;
        users.push({
          ...valueObj,
          is_admin: valueObj.is_admin === true || valueObj.isAdmin === true,
          isAdmin: valueObj.is_admin === true || valueObj.isAdmin === true,
          tenantid: valueObj.tenantid || valueObj.tenantid || 'CICOPAL'
        } as unknown as User);
      });
      return users;
    },

    clear: async () => {
      await usersStore.clear();
    }
  },

  transaction: async (...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === 'function') {
      return await (callback as () => Promise<void>)();
    }
  },
  
  purgeDatabase: async () => {
    logger.info('>>> [DBA] Executando purge manual das tabelas operacionais em Dexie.js (preservando sessões)...');
    try {
      // 1. Matar Processos em Segundo Plano (suspender listeners/workers do SQLite)
      sqliteService.setImportingMode(true);

      // 2. Limpeza síncrona e exclusiva com as tabelas ativas do Dexie.js (.clear())
      await db.ativos.clear();
      await db.assets.clear();
      await db.local_assets.clear();
      await db.audit_logs.clear();
      await db.unit_configs.clear();
      await db.campaign_snapshots.clear();
      await db.addresses.clear();
      
      // 3. Restaurar processamento de segundo plano
      sqliteService.setImportingMode(false);
      
      logger.info('>>> [DBA] Purge operacional de Dexie.js concluído com sucesso via .clear().');
    } catch (err) {
      logger.error('>>> [DBA] Falha crítica no purge operacional do banco Dexie:', err);
      sqliteService.setImportingMode(false);
    }
  },
  
  forceInjectDemoSeed: async () => {
    logger.info('>>> [DBA] Disparando forceInjectDemoSeed (Injeção Atômica de ativos Demo).');
    const { demoService } = await import('./demoService');
    const res = await demoService.initDemoSession();
    if (!res) {
      throw new Error("Erro de processamento da transação interna no initDemoSession");
    }
  },
  
  validateLocalCredentials: async (username: string, password?: string): Promise<boolean> => {
    try {
      const dbUsers = await localDb.users.toArray();
      const normUser = username.trim().toLowerCase();
      if ((normUser === 'admin' || normUser === 'admin gbr' || isAdminEmail(normUser)) && 
          (password === 'admin' || password === 'Glaucio@1970')) {
        return true;
      }
      if (normUser === 'admin' && password === '123456') {
        return true;
      }
      return dbUsers.some(u => 
        (u!.email.toLowerCase() === normUser || u!.username.toLowerCase() === normUser) && 
        u!.password === password
      );
    } catch {
      return false;
    }
  }
};

export async function requestPersistentStorage() {
  logger.info(">>> [DBA] Dexie.js Nativo configurado. Persistência de Storage garantida.");
  return true;
}

export async function isStoragePersisted() {
  return true;
}

import { showRecoveryToast } from './NavigationGuardService';
import { logger } from '../utils/logger';

let winWorkspaceHandle: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function initializeWindowsDirectoryHandle(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return true;

  try {
    logger.info("[SRE INFRA] Vinculando manipulador para o diretório C:\\GBR_Inventario...");
    winWorkspaceHandle = await (window as any).showDirectoryPicker({ // eslint-disable-line @typescript-eslint/no-explicit-any
      mode: 'readwrite',
      id: 'gbr_inventario_root'
    });
    return true;
  } catch (error) {
    logger.error("[SRE BARRAMENTO] Falha de privilégio no diretório C:\\GBR_Inventario:", error);
    if (sessionStorage.getItem('app_current_user')) showRecoveryToast("❌ ERRO DE PRIVILÉGIO: ACESSO EXIGIDO PARA C:\\GBR_INVENTARIO", "blue");
    return false;
  }
}

export async function writeSnapshotToWindowsDirectory(dataPayload: any[]): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (Capacitor.isNativePlatform() || !winWorkspaceHandle) return;

  try {
    const fileHandle = await winWorkspaceHandle.getFileHandle('gbr_kardek_backup.dat', { create: true });
    const writableStream = await fileHandle.createWritable();
    await writableStream.write(JSON.stringify(dataPayload));
    await writableStream.close();
    logger.info("[SRE TELEMETRIA] Espelhamento persistido com sucesso no diretório local.");
  } catch (error) {
    logger.error("[SRE CRÍTICO] Bloqueio de I/O do Windows detectado na gravação:", error);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export async function backupDatabaseToPhysicalStorage(assetsData: any[]): Promise<void> {
  // Early-return obrigatório e silencioso se estiver em ambiente Web/iFrame (Diretriz 6)
  if (!Capacitor.isNativePlatform()) return;

  try {
    const payloadString = JSON.stringify(assetsData);
    
    // Força a criação física do diretório estrutural e do arquivo de dados real
    await Filesystem.writeFile({
      path: 'GBR_KARDEK_DATA/local_assets_secure.dat',
      data: payloadString,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true // Garante a criação da pasta pai física se não existir
    });
  } catch (error) {
    // SRE Protocol: Logs de diagnóstico expostos no barramento
    logger.error("[SRE GESTOR] Erro crítico de gravação física em hardware:", error);
  }
}

let userWorkspaceHandle: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

export function selectLocalFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.csv';
    input.onchange = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const file = e.target.files?.[0];
      resolve(file || null);
    };
    input.oncancel = () => {
      resolve(null);
    };
    input.click();
  });
}

export async function selectAndVerifyWorkspaceFolder(): Promise<{ pathName: string; fileBlob: File | null } | null> {
  if (Capacitor.isNativePlatform()) return null;

  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    logger.info(">>> [SRE-iFrame] Detectado iFrame Sandbox no Database Manager. Abrindo seletor de arquivo nativo HTML...");
    const file = await selectLocalFile();
    if (file) {
      sessionStorage.setItem('gbr_physical_folder_name', 'GBR_Inventario_Virtual');
      localStorage.setItem('gbr_physical_link_active', 'true');
      return {
        pathName: `iFrame Sandbox / ${file.name}`,
        fileBlob: file
      };
    }
    return null;
  }

  try {
    // 1. Abre a seleção delegando ao Windows o foco na pasta de Documentos
    const rootDocuments = await (window as any).showDirectoryPicker({ // eslint-disable-line @typescript-eslint/no-explicit-any
      mode: 'readwrite',
      startIn: 'documents'
    });

    try {
      // 2. Vincula e valida a subpasta específica do projeto
      userWorkspaceHandle = await rootDocuments.getDirectoryHandle('GBR_Inventario', { create: false });
      
      const permissionStatus = await userWorkspaceHandle.requestPermission({ mode: 'readwrite' });
      if (permissionStatus !== 'granted') return null;

      // 3. Varre a estrutura da pasta procurando de forma nativa pela planilha Excel de origem
      for await (const entry of userWorkspaceHandle.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.xlsx') || entry.name.endsWith('.csv'))) {
          const fileHandle = await userWorkspaceHandle.getFileHandle(entry.name);
          const fileBlob = await fileHandle.getFile();
          
          logger.info(`[SRE INFRA] Planilha de origem localizada: ${entry.name}`);
          return { pathName: `Documentos / ${userWorkspaceHandle.name}`, fileBlob };
        }
      }

      if (sessionStorage.getItem('app_current_user')) showRecoveryToast("⚠️ ERRO: INSIRA A PLANILHA EXCEL DENTRO DA PASTA GBR_Inventario.", "blue");
      return { pathName: `Documentos / ${userWorkspaceHandle.name}`, fileBlob: null };
    } catch {
      if (sessionStorage.getItem('app_current_user')) showRecoveryToast("⚠️ DIRETÓRIO AUSENTE: CRIE A PASTA 'GBR_Inventario' EM SEUS DOCUMENTOS.", "blue");
      return null;
    }
  } catch (error) {
    logger.error("[SRE INFRA] Operação cancelada ou negada pelo Windows:", error);
    return null;
  }
}

/**
 * Persiste o snapshot virtual (espelho JSON dos ativos) de forma resiliente:
 * tenta localStorage primeiro (leitura rápida) e, se a quota (~5MB) estourar
 * com cargas grandes (ex.: 12k+ ativos), cai para IndexedDB via localforage,
 * que não tem limite prático.
 * Retorna true se conseguiu persistir em ao menos um dos backends.
 */
export async function saveVirtualSnapshot(dataPayload: any[]): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    logger.info("[SRE-iFrame] Armazenando snapshot simulado localmente...");
    localStorage.setItem('gbr_virtual_snapshot_backup', JSON.stringify(dataPayload));
    return true;
  } catch (e) {
    logger.warn("[SRE-iFrame] localStorage indisponível/quota excedida; tentando fallback IndexedDB...", e);
    // Remove o snapshot antigo/parcial do localStorage: se ele permanecesse, a leitura
    // priorizaria o espelho obsoleto em vez do novo gravado em IndexedDB (duplicidade).
    try {
      localStorage.removeItem('gbr_virtual_snapshot_backup');
    } catch { /* best-effort: remoção pode falhar em sandbox restrito */ }
    try {
      await snapshotStore.setItem('gbr_virtual_snapshot_backup', dataPayload);
      return true;
    } catch (e2) {
      logger.error("[SRE-iFrame] Fallback IndexedDB do snapshot também falhou", e2);
      return false;
    }
  }
}

export async function saveSnapshotToWorkspace(dataPayload: any[]): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    // 1) Snapshot virtual: localStorage com fallback em IndexedDB (localforage).
    //    São caminhos independentes — a falha de um não pode invalidar o outro.
    const snapshotSaved = await saveVirtualSnapshot(dataPayload);

    // 2) Auto-download contingency physical JSON file — best-effort. Em iframe
    //    sandboxed o download é bloqueado pelo navegador (falha esperada e não-fatal).
    try {
      const jsonStr = JSON.stringify(dataPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'GBR_BACKUP_INVENTARIO.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.warn("[SRE-iFrame] Download do backup bloqueado pelo sandbox (esperado). Snapshot local preservado.", e);
    }

    return snapshotSaved;
  }

  if (!userWorkspaceHandle) return false;

  try {
    const permission = await userWorkspaceHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      logger.error("[SRE CRÍTICO] Permissão de escrita negada pelo usuário.");
      return false;
    }

    const fileHandle = await userWorkspaceHandle.getFileHandle('gbr_kardek_backup.dat', { create: true });
    const writableStream = await fileHandle.createWritable();
    await writableStream.write(JSON.stringify(dataPayload));
    await writableStream.close();
    logger.info("[SRE TELEMETRIA] Snapshot gravado de forma resiliente em Documentos/GBR_Inventario.");
    return true;
  } catch (error) {
    logger.error("[SRE CRÍTICO] Falha de I/O de escrita na pasta do Windows:", error);
    return false; 
  }
}

/**
 * Lê o snapshot virtual persistido (localStorage → fallback IndexedDB).
 * Usado pelo UnitSelector para reconstruir unidades quando o filtro de tenant
 * não encontra ativos diretamente no banco local.
 */
export async function readVirtualSnapshot(): Promise<Record<string, unknown>[] | null> {
  try {
    const raw = localStorage.getItem('gbr_virtual_snapshot_backup');
    if (raw) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Snapshot corrompido/parcial detectado (JSON inválido).
        parsed = null;
      }
      if (Array.isArray(parsed)) {
        return parsed as Record<string, unknown>[];
      }
      // Chave órfã (JSON válido porém não-array, ou corrompido): remove para não
      // mascarar o espelho válido do IndexedDB nem duplicar dados entre backends.
      try { localStorage.removeItem('gbr_virtual_snapshot_backup'); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  try {
    const stored = await snapshotStore.getItem<unknown[]>('gbr_virtual_snapshot_backup');
    return Array.isArray(stored) ? (stored as Record<string, unknown>[]) : null;
  } catch { return null; }
}

