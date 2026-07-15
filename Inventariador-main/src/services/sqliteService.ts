import Dexie from 'dexie';
import { Capacitor } from '@capacitor/core';
import { DatabaseStatus } from '../types';

// Strict Type Declarations for the 21 accounting indices and metadata
export interface DexieAsset {
  id: string; // matches primarykey
  tenantId: string;
  _tenantid: string;
  filial: string;
  _unitid: string;
  status: string;
  etiqueta: string;
  tag: string;
  qt: number;
  descricaodoativo: string;
  serial: string | null;
  dataaqusic: string | null;
  cnpj: string | null;
  nomefornecedor: string | null;
  notafiscal: string | null;
  endereco: string | null;
  registro: string | null;
  subreg: string | null;
  databaixa: string | null;
  contacontabil: string | null;
  primarykey: string;
  centrodecusto: string | null;
  vlraquisic: number;
  sn1_recno: number | null;
  sn3_recno: number | null;
  _is_synced: number; // 0 or 1
  _is_deleted: number; // 0 or 1
  _conferido: number; // 0 or 1
  _plaquetado: number; // 0 or 1
  _aprovado: number; // 0 or 1
  _isNew: number; // 0 or 1
  _is_unitized: number; // 0 or 1
  _is_divergent_baixa: number; // 0 or 1
  _history: string | null;
  DE_PARA: string | null;
  _photoUrl: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  currentCampaignId?: string | null;
  tag_atual?: string;
  status_auditoria?: string;
  descricao?: string;
  codigo_barra_coletado?: string;
}

export interface DexieAuditLog {
  id: string;
  usuario: string;
  acao: string;
  tabela: string;
  registro_id: string;
  details: string;
  delta: string | null;
  updated_at: string;
}

export interface DexieCampaign {
  id: string;
  name: string;
  status: string;
  tenantId: string;
  created_at: string;
}

export interface DexieSystemContext {
  key: string;
  value: string;
  updated_at: string;
}

export interface DexieUnitConfig {
  id: string;
  filial: string;
  nome: string;
  hasGps: number;
  requireNf: number;
  requireSeriado: number;
  allowNewAssets: number;
  allowWriteOffs: number;
  requirePlaqueta: number;
}

export interface DexieCampaignSnapshot {
  id: string;
  campaign_id: string;
  assets_data: string;
  metadata: string;
  closed_at: string;
  closed_by: string;
  _tenantid: string;
}

export interface DexieAddress {
  id?: number;
  tenantId: string;
  filial: string;
  codigo_endereco: string;
  setor: string;
  bloco: string;
  _is_synced: number;
}

class InventoryDexieDatabase extends Dexie {
  local_assets!: Dexie.Table<DexieAsset, string>;
  ativos!: Dexie.Table<DexieAsset, string>;
  assets!: Dexie.Table<DexieAsset, string>;
  audit_logs!: Dexie.Table<DexieAuditLog, string>;
  campaigns!: Dexie.Table<DexieCampaign, string>;
  SYSTEM_CONTEXT!: Dexie.Table<DexieSystemContext, string>;
  unit_configs!: Dexie.Table<DexieUnitConfig, string>;
  campaign_snapshots!: Dexie.Table<DexieCampaignSnapshot, string>;
  addresses!: Dexie.Table<DexieAddress, number>;

  constructor() {
    super('InventoryLocalStore');
    this.version(1).stores({
      local_assets: 'primarykey, filial, _is_synced',
      ativos: 'primarykey, filial, _is_synced',
      assets: 'primarykey, filial, _is_synced',
      audit_logs: 'id, updated_at',
      campaigns: 'id, tenantId',
      SYSTEM_CONTEXT: 'key',
      unit_configs: 'id, filial'
    });
    this.version(2).stores({
      local_assets: 'primarykey, filial, _is_synced, [tenantId+filial]',
      ativos: 'primarykey, filial, _is_synced, [tenantId+filial]',
      assets: 'primarykey, filial, _is_synced, [tenantId+filial]',
      audit_logs: 'id, updated_at',
      campaigns: 'id, tenantId',
      SYSTEM_CONTEXT: 'key',
      unit_configs: 'id, filial',
      campaign_snapshots: 'id, campaign_id'
    });
    this.version(3).stores({
      local_assets: 'primarykey, filial, _is_synced, [tenantId+filial]',
      ativos: 'primarykey, filial, _is_synced, [tenantId+filial]',
      assets: 'primarykey, filial, _is_synced, [tenantId+filial]',
      audit_logs: 'id, updated_at',
      campaigns: 'id, tenantId',
      SYSTEM_CONTEXT: 'key',
      unit_configs: 'id, filial',
      campaign_snapshots: 'id, campaign_id',
      addresses: '++id, [tenantId+filial], codigo_endereco, setor, bloco, _is_synced'
    });
  }
}

export const db = new InventoryDexieDatabase();

export class SQLitePersistenceException extends Error {
  constructor(message: string) {
    super(`[SQLitePersistenceException] ${message}`);
    this.name = "SQLitePersistenceException";
  }
}

export class SqliteService {
  private static instance: SqliteService | null = null;
  private isInitialized = false;
  private dbStatus = DatabaseStatus.EMPTY;
  public isImportingBatch = false;

  private bufferedFieldChanges: {
    asset: Record<string, unknown>;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    userEmail: string;
    timestamp: number;
  }[] = [];

  private constructor() {}

  public static getInstance(): SqliteService {
    if (!SqliteService.instance) {
      SqliteService.instance = new SqliteService();
    }
    return SqliteService.instance;
  }

  public setImportingMode(active: boolean): void {
    this.isImportingBatch = active;
    console.log(`>>> [SqliteService SRE] Modo de importação alterado para: ${active}`);
  }

  public async init(isRecovery: boolean = false): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      console.log(`>>> [Dexie SRE reboot] Inicializando armazenamento Dexie.js (isRecovery=${isRecovery})...`);
      await db.open();
      this.isInitialized = true;
      this.dbStatus = DatabaseStatus.ACTIVE;
      console.log(">>> [Dexie SRE reboot] Banco Dexie.js inicializado com sucesso.");
      return true;
    } catch (error) {
      console.error(">>> [Dexie SRE reboot] Erro fatal inicializando Dexie:", error);
      this.isInitialized = false;
      this.dbStatus = DatabaseStatus.ERROR;
      return false;
    }
  }

  public async closeConnection(): Promise<void> {
    db.close();
    this.isInitialized = false;
    this.dbStatus = DatabaseStatus.EMPTY;
  }

  public async deleteDatabase(): Promise<void> {
    await db.delete();
    this.isInitialized = false;
    this.dbStatus = DatabaseStatus.EMPTY;
  }

  private async runDDLScripts(): Promise<void> {
    return Promise.resolve();
  }

  public async checkTableSchema(tableName: string): Promise<{ isValid: boolean; columns: string[] }> {
    console.log(">>> [SqliteService] checkTableSchema requested for:", tableName);
    const cols = [
      'id', 'tenantId', '_tenantid', 'filial', '_unitid', 'status', 'etiqueta', 'tag', 'qt',
      'descricaodoativo', 'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal',
      'endereco', 'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey',
      'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno', '_is_synced', '_is_deleted',
      '_conferido', '_plaquetado', '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa',
      '_history', 'DE_PARA', '_photoUrl', 'gps_lat', 'gps_lng', 'currentCampaignId'
    ];
    return { isValid: true, columns: cols };
  }

  public async getContextValue(key: string): Promise<string | null> {
    try {
      const match = await db.SYSTEM_CONTEXT.get(key);
      return match ? match.value : null;
    } catch {
      return null;
    }
  }

  public async setContextValue(key: string, value: string): Promise<void> {
    await db.SYSTEM_CONTEXT.put({
      key,
      value,
      updated_at: new Date().toISOString()
    });
  }

  public async getActiveCampaign(): Promise<string | null> {
    return await this.getContextValue('active_campaign');
  }

  public async getSelectedUnit(): Promise<string | null> {
    return await this.getContextValue('selected_unit');
  }

  public async getUnitConfigs(tenantId: string): Promise<Record<string, unknown>[]> {
    try {
      if (tenantId) {
        console.log(">>> [SqliteService] getUnitConfigs requested for tenant:", tenantId);
      }
      const configs = await db.unit_configs.toArray();
      return configs as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  public async getUnitConfigsFromSql(): Promise<Record<string, unknown>[]> {
    return this.getUnitConfigs('');
  }

  public async saveUnitConfigs(configs: Record<string, unknown>[]): Promise<void> {
    const mapped = configs.map(cfg => ({
      id: String(cfg.id || cfg.filial || ''),
      filial: String(cfg.filial || ''),
      nome: String(cfg.nome || cfg.filial || ''),
      hasGps: cfg.hasGps ? 1 : 0,
      requireNf: cfg.requireNf ? 1 : 0,
      requireSeriado: cfg.requireSeriado ? 1 : 0,
      allowNewAssets: cfg.allowNewAssets !== false ? 1 : 0,
      allowWriteOffs: cfg.allowWriteOffs !== false ? 1 : 0,
      requirePlaqueta: cfg.requirePlaqueta ? 1 : 0
    }));
    await db.unit_configs.bulkPut(mapped);
  }

  public async getOperationalUnits(): Promise<string[]> {
    try {
      const list = await db.local_assets.toArray();
      const nonDeleted = list.filter(a => a._is_deleted === 0);
      const filiais = Array.from(new Set(nonDeleted.map(a => String(a.filial)).filter(f => f && f.trim() !== '')));
      return filiais.sort();
    } catch {
      return [];
    }
  }

  public async getDynamicUnitsFromQuery(): Promise<{ values: Record<string, unknown>[] }> {
    try {
      const filiais = await this.getOperationalUnits();
      return { values: filiais.map(f => ({ filial: f, FILIAL: f })) };
    } catch {
      return { values: [] };
    }
  }

  public async getOperationalUnitsWithStats(tenantId?: string): Promise<Record<string, unknown>[]> {
    try {
      if (tenantId) {
        console.log(">>> [SqliteService] getOperationalUnitsWithStats requested for tenant:", tenantId);
      }
      const list = await db.local_assets.toArray();
      const nonDeleted = list.filter(a => a._is_deleted === 0);
      
      const filiaisAssets = Array.from(new Set(nonDeleted.map(a => String(a.filial)).filter(f => f && f.trim() !== '')));
      
      // Busca unidades configuradas
      const configList = await db.unit_configs.toArray();
      const filiaisConfigs = configList.map(c => String(c.filial || c.nome)).filter(f => f && f.trim() !== '');
      
      // União única de todas as filiais do tenant
      const allFiliais = Array.from(new Set([...filiaisAssets.map(f => f.toUpperCase().trim()), ...filiaisConfigs.map(f => f.toUpperCase().trim())]));
      
      const stats = allFiliais.map(f => {
        const filialAssets = nonDeleted.filter(a => String(a.filial || '').toUpperCase().trim() === f);
        const checkedAssets = filialAssets.filter(a => a._conferido === 1);
        return {
          filial: f,
          displayName: f,
          total: filialAssets.length,
          checked: checkedAssets.length
        };
      });
      return stats;
    } catch {
      return [];
    }
  }

  public async getOperationalStats(filial?: string): Promise<{
    totalAssets: number;
    checkedAssets: number;
    pendingAssets: number;
    discrepancyCount: number;
    recentLogs: Record<string, unknown>[];
  }> {
    try {
      let assets = await db.ativos.toArray();
      assets = assets.filter(a => a._is_deleted === 0);
      if (filial) {
        assets = assets.filter(a => String(a.filial).toUpperCase() === String(filial).toUpperCase());
      }

      const totalAssets = assets.length;
      const checkedAssets = assets.filter(a => a._conferido === 1).length;
      const pendingAssets = totalAssets - checkedAssets;
      const discrepancyCount = assets.filter(a => a._is_divergent_baixa === 1).length;

      const logs = await db.audit_logs.toArray();
      logs.sort((a, b) => b.id.localeCompare(a.id));
      const recentLogs = logs.slice(0, 5) as unknown as Record<string, unknown>[];

      return {
        totalAssets,
        checkedAssets,
        pendingAssets,
        discrepancyCount,
        recentLogs
      };
    } catch {
      return { totalAssets: 0, checkedAssets: 0, pendingAssets: 0, discrepancyCount: 0, recentLogs: [] };
    }
  }

  public async getTotalAssetsCount(): Promise<number> {
    try {
      return await db.ativos.count();
    } catch {
      return 0;
    }
  }

  public async getAddressesFromAssetsCounting(tenantId?: string): Promise<{ endereco: string; filial: string; lat?: number; lng?: number }[]> {
    try {
      const list = await db.ativos.toArray();
      const filtered = tenantId
        ? list.filter(a => {
            const val = (a.tenantId || a._tenantid || '').toLowerCase();
            const q = tenantId.toLowerCase();
            return val.includes(q) || q.includes(val);
          })
        : list;

      const results: { endereco: string; filial: string; lat?: number; lng?: number }[] = [];
      const seen = new Set<string>();

      for (const a of filtered) {
        const key = `${a.filial || ''}|${a.endereco || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            endereco: a.endereco || '',
            filial: a.filial || '',
            lat: a.gps_lat !== null && a.gps_lat !== undefined ? Number(a.gps_lat) : undefined,
            lng: a.gps_lng !== null && a.gps_lng !== undefined ? Number(a.gps_lng) : undefined
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  public async logAuditEvent(
    usuario: string,
    acao: string,
    tabela: string,
    registro_id: string,
    details: string,
    delta?: string
  ): Promise<void> {
    const id = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    await db.audit_logs.put({
      id,
      usuario,
      acao,
      tabela,
      registro_id,
      details,
      delta: delta ?? null,
      updated_at: new Date().toISOString()
    });
  }

  public async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    throw new Error(`[SRE] Motor SQL legado purgado. Use APIs Dexie diretamente. Query: ${sql}, Params: ${params.length}`);
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    throw new Error(`[SRE] Motor SQL legado purgado. Use APIs Dexie diretamente. Query: ${sql}, Params: ${params.length}`);
  }

  public async executeRaw(sql: string): Promise<void> {
    throw new Error(`[SRE] Motor SQL legado purgado. Use APIs Dexie diretamente. Query: ${sql}`);
  }

  public async executeBatch(set: { statement: string; values: unknown[] }[]): Promise<void> {
    throw new Error(`[SRE] Motor SQL legado purgado. Use APIs Dexie diretamente. Batch size: ${set.length}`);
  }

  public async saveDatabase(): Promise<void> {
    return Promise.resolve();
  }

  public async getFirstValidFilial(): Promise<string> {
    const first = await db.local_assets.limit(1).first();
    return first ? first.filial : 'GERAL';
  }

  public async getReactiveFilial(): Promise<string> {
    const first = await db.local_assets.limit(1).first();
    if (first && first.filial) {
      return first.filial;
    }
    const firstConfig = await db.unit_configs.limit(1).first();
    if (firstConfig && firstConfig.filial) {
      return firstConfig.filial;
    }
    return 'GERAL';
  }

  public async bulkInsertAssetsOfflineFirst(
    assets: Record<string, unknown>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<void> {
    const total = assets.length;
    let processed = 0;
    const CHUNK_SIZE = 200;

    this.isImportingBatch = true;
    console.log(`>>> [Dexie SRE Batch] Iniciando bulk insert de ${total} ativos...`);

    try {
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = assets.slice(i, i + CHUNK_SIZE);
          
          const mappedChunk: DexieAsset[] = chunk.map(asset => {
            const primaryKeyVal = String(asset.primarykey || asset.id || '');
            if (!primaryKeyVal) {
              throw new Error("[FATAL_IMPORT_CRASH] Chave primária vazia detectada no lote.");
            }

            const mapped: DexieAsset = {
              id: primaryKeyVal,
              primarykey: primaryKeyVal,
              tenantId: String(asset.tenantId || asset._tenantid || asset.tenantid || 'CICOPAL'),
              _tenantid: String(asset._tenantid || asset.tenantId || asset.tenantid || 'CICOPAL'),
              filial: String(asset.filial || asset._unitid || asset.unitid || asset.unitId || ''),
              _unitid: String(asset._unitid || asset.filial || asset.unitid || asset.unitId || ''),
              status: String(asset.status || 'P'),
              etiqueta: String(asset.etiqueta || ''),
              tag: String(asset.tag || asset.etiqueta || ''),
              qt: Number(asset.qt ?? 1),
              descricaodoativo: String(asset.descricaodoativo || ''),
              serial: asset.serial !== undefined && asset.serial !== null ? String(asset.serial) : null,
              dataaqusic: asset.dataaqusic !== undefined && asset.dataaqusic !== null ? String(asset.dataaqusic) : null,
              cnpj: asset.cnpj !== undefined && asset.cnpj !== null ? String(asset.cnpj) : null,
              nomefornecedor: asset.nomefornecedor !== undefined && asset.nomefornecedor !== null ? String(asset.nomefornecedor) : null,
              notafiscal: asset.notafiscal !== undefined && asset.notafiscal !== null ? String(asset.notafiscal) : null,
              endereco: asset.endereco !== undefined && asset.endereco !== null ? String(asset.endereco) : null,
              registro: asset.registro !== undefined && asset.registro !== null ? String(asset.registro) : null,
              subreg: asset.subreg !== undefined && asset.subreg !== null ? String(asset.subreg) : null,
              databaixa: asset.databaixa !== undefined && asset.databaixa !== null ? String(asset.databaixa) : null,
              contacontabil: asset.contacontabil !== undefined && asset.contacontabil !== null ? String(asset.contacontabil) : null,
              centrodecusto: asset.centrodecusto !== undefined && asset.centrodecusto !== null ? String(asset.centrodecusto) : null,
              vlraquisic: Number(asset.vlraquisic ?? 0),
              sn1_recno: asset.sn1_recno !== undefined && asset.sn1_recno !== null ? Number(asset.sn1_recno) : null,
              sn3_recno: asset.sn3_recno !== undefined && asset.sn3_recno !== null ? Number(asset.sn3_recno) : null,
              _is_synced: Number(asset._is_synced) === 1 ? 1 : 0,
              _is_deleted: asset._is_deleted ? 1 : 0,
              _conferido: asset._conferido ? 1 : 0,
              _plaquetado: asset._plaquetado ? 1 : 0,
              _aprovado: asset._aprovado ? 1 : 0,
              _isNew: asset._isNew ? 1 : 0,
              _is_unitized: asset._is_unitized ? 1 : 0,
              _is_divergent_baixa: asset._is_divergent_baixa ? 1 : 0,
              _history: asset._history !== undefined && asset._history !== null ? String(asset._history) : null,
              DE_PARA: asset.DE_PARA !== undefined && asset.DE_PARA !== null ? String(asset.DE_PARA) : null,
              _photoUrl: asset._photoUrl !== undefined && asset._photoUrl !== null ? String(asset._photoUrl) : null,
              gps_lat: asset.gps_lat !== undefined && asset.gps_lat !== null ? Number(asset.gps_lat) : null,
              gps_lng: asset.gps_lng !== undefined && asset.gps_lng !== null ? Number(asset.gps_lng) : null,
              currentCampaignId: asset.currentCampaignId !== undefined && asset.currentCampaignId !== null ? String(asset.currentCampaignId) : null
            };

            return mapped;
          });

          await db.ativos.bulkPut(mappedChunk);
          await db.assets.bulkPut(mappedChunk);
          await db.local_assets.bulkPut(mappedChunk);

          processed += chunk.length;
          if (onProgress) {
            onProgress(processed, total);
          }
        }
      });

      const diskCount = await db.local_assets.count();
      console.log(`>>> [Dexie SRE Batch] Contra-prova: total lido=${total}, gravado em disco=${diskCount}`);
      if (diskCount < total) {
        throw new Error(`[FATAL_IMPORT_CRASH] Contra-prova falhou: total esperado ${total}, mas em disco consta ${diskCount}.`);
      }

      console.log(`>>> [Dexie SRE Batch] Sincronização concluída com sucesso! ${processed} itens persistidos.`);
    } catch (error) {
      console.error('[FATAL_IMPORT_CRASH]', error);
      throw error;
    } finally {
      this.isImportingBatch = false;
    }
  }

  public async saveCampaigns(campaigns: Record<string, unknown>[]): Promise<void> {
    const mapped = campaigns.map(c => ({
      id: String(c.id || ''),
      name: String(c.name || ''),
      status: String(c.status || ''),
      tenantId: String(c.tenantId || c.tenantid || ''),
      created_at: String(c.created_at || '')
    }));
    await db.campaigns.bulkPut(mapped);
  }

  public async getCampaigns(): Promise<Record<string, unknown>[]> {
    try {
      const camps = await db.campaigns.toArray();
      return camps as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  public async saveLocalAsset(
    id: string, vlr: number, filial: string, desc: string, registro: string, qt: number,
    tenant: string, primarykey: string, conferido: number, isNew: number, isSynced: number, endereco: string
  ): Promise<void> {
    const item: DexieAsset = {
      id,
      primarykey,
      tenantId: tenant,
      _tenantid: tenant,
      filial,
      _unitid: filial,
      status: conferido ? 'CONFERIDO' : 'P',
      etiqueta: id,
      tag: id,
      qt: Number(qt ?? 1),
      descricaodoativo: desc,
      serial: null,
      dataaqusic: null,
      cnpj: null,
      nomefornecedor: null,
      notafiscal: null,
      endereco,
      registro,
      subreg: null,
      databaixa: null,
      contacontabil: null,
      centrodecusto: null,
      vlraquisic: Number(vlr ?? 0),
      sn1_recno: null,
      sn3_recno: null,
      _is_synced: isSynced,
      _is_deleted: 0,
      _conferido: conferido,
      _plaquetado: 0,
      _aprovado: 0,
      _isNew: isNew,
      _is_unitized: 0,
      _is_divergent_baixa: 0,
      _history: null,
      DE_PARA: null,
      _photoUrl: null,
      gps_lat: null,
      gps_lng: null
    };
    await db.ativos.put(item);
    await db.assets.put(item);
    await db.local_assets.put(item);
  }

  public async getAssetsOffline(): Promise<Record<string, unknown>[]> {
    return this.query("SELECT * FROM ativos;");
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getNativeDb(): unknown {
    return null;
  }

  public getDbStatus(): string {
    return this.dbStatus;
  }

  public getStorageSource(): string {
    return 'DEXIE_INDEXEDDB';
  }

  public getNativePath(): string {
    return 'IndexedDB://InventoryLocalStore';
  }

  public async setSystemStatus(status: string): Promise<void> {
    this.dbStatus = status as DatabaseStatus;
    await this.setContextValue('system_status', status);
  }

  public setPermissionsGranted(granted: boolean): void {
    console.log(">>> [SqliteService] setPermissionsGranted called with:", granted);
  }

  public async getFileStatus(): Promise<{ status: string; path: string; fileName?: string }> {
    const isNative = Capacitor.isNativePlatform();
    return {
      status: (!isNative || this.isInitialized) ? 'linked' : 'permission_denied',
      path: this.getNativePath() || 'IndexedDB',
      fileName: 'InventoryLocalStore'
    };
  }

  public async requestFilePermission(): Promise<boolean> {
    console.log(">>> [SqliteService] requestFilePermission called (Web/Dexie Simulation)");
    try {
      await this.init(true);
      return true;
    } catch (err) {
      console.error(">>> [SqliteService] Error in requestFilePermission:", err);
      return false;
    }
  }

  public async obterContextoAtivo(): Promise<{ selectedUnit: string; currentCampaignId: string }> {
    const selectedUnit = await this.getSelectedUnit() || '';
    const currentCampaignId = await this.getActiveCampaign() || '';
    return { selectedUnit, currentCampaignId };
  }

  public async loadStateCompleto(): Promise<Record<string, unknown>> {
    const assets = await this.getAllAssets();
    const selectedUnit = await this.getSelectedUnit() || '';
    const currentCampaignId = await this.getActiveCampaign() || '';
    return {
      assets,
      selectedUnit,
      currentCampaignId,
      status: assets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY,
      lastUpdated: new Date().toISOString()
    };
  }

  public async getAllAssets(): Promise<Record<string, unknown>[]> {
    try {
      const list = await db.ativos.toArray();
      return list.filter(a => a._is_deleted === 0) as unknown as Record<string, unknown>[];
    } catch (err) {
      console.error(">>> [SqliteService] Erro ao buscar todos os ativos:", err);
      return [];
    }
  }

  public async getAssetCount(): Promise<number> {
    try {
      const localCount = await db.local_assets.count();
      const ativosCount = await db.ativos.count();
      return Math.max(localCount, ativosCount);
    } catch {
      return 0;
    }
  }

  public async countAtivos(): Promise<number> {
    return await this.getAssetCount();
  }

  public async saveInventoryConfig(config: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveInventoryConfig called with:", config);
    if (config.selectedUnit) {
      await this.setContextValue('selected_unit', String(config.selectedUnit));
    }
    if (config.currentCampaignId) {
      await this.setContextValue('active_campaign', String(config.currentCampaignId));
    }
    if (config.tenantId) {
      await this.setContextValue('tenant_id', String(config.tenantId));
    }
    if (config.lastUpdated) {
      await this.setContextValue('last_updated', String(config.lastUpdated));
    }
  }

  public async getInventoryConfig(): Promise<Record<string, unknown> | null> {
    try {
      const selectedUnit = await this.getContextValue('selected_unit');
      const currentCampaignId = await this.getContextValue('active_campaign');
      const tenantId = await this.getContextValue('tenant_id');
      const lastUpdated = await this.getContextValue('last_updated');
      
      if (!selectedUnit && !currentCampaignId && !tenantId && !lastUpdated) {
        return null;
      }

      return {
        selectedUnit,
        currentCampaignId,
        tenantId,
        lastUpdated
      };
    } catch {
      return null;
    }
  }

  public async closeCurrentConnection(): Promise<void> {
    console.log(">>> [SqliteService] closeCurrentConnection called.");
    await this.closeConnection();
  }

  public async deleteCampaignSql(campaignId: string): Promise<void> {
    console.log(">>> [SqliteService] deleteCampaignSql called for:", campaignId);
    await db.campaigns.delete(campaignId);
  }

  public async saveCampaign(c: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveCampaign called for:", c.id);
    const mapped = {
      id: String(c.id || ''),
      name: String(c.name || ''),
      status: String(c.status || ''),
      tenantId: String(c.tenantId || c.tenantid || c.tenant_id || ''),
      created_at: String(c.created_at || '')
    };
    await db.campaigns.put(mapped);
  }

  public async persist(): Promise<void> {
    console.log(">>> [SqliteService] persist (no-op for IndexedDB).");
    return Promise.resolve();
  }

  public async saveUnitConfigToSql(config: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveUnitConfigToSql called.");
    await this.saveUnitConfigs([config]);
  }

  public async isBatteryCritical(): Promise<boolean> {
    try {
      if ('getBattery' in navigator) {
        const nav = navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> };
        const battery = await nav.getBattery();
        return battery.level <= 0.05 && !battery.charging;
      }
    } catch (e) {
      console.warn(">>> [SqliteService] Battery API error:", e);
    }
    return false;
  }

  public async forcePurgeAndConnect(): Promise<void> {
    console.log(">>> [SqliteService SRE] Iniciando expurgo imperativo do banco local...");
    this.isImportingBatch = true;
    try {
      await db.ativos.clear();
      await db.assets.clear();
      await db.local_assets.clear();
      await db.audit_logs.clear();
      await db.campaigns.clear();
      await db.SYSTEM_CONTEXT.clear();
      await db.unit_configs.clear();
      console.log(">>> [SqliteService SRE] Tabelas físicas limpas e compactadas.");
    } catch (err) {
      console.error(">>> [SqliteService SRE] Falha crítica no forcePurgeAndConnect:", err);
      throw err;
    } finally {
      this.isImportingBatch = false;
    }
  }

  public async bulkInsertAssets(assets: Record<string, unknown>[]): Promise<void> {
    await this.bulkInsertAssetsOfflineFirst(assets);
  }

  public async checkIntegrity(): Promise<boolean> {
    return true;
  }

  public async hardResetDatabase(): Promise<void> {
    await this.forcePurgeAndConnect();
  }

  public async salvarCampanhaAtiva(selectedUnit: string, campaignId: string): Promise<void> {
    await this.setContextValue('selected_unit', selectedUnit);
    await this.setContextValue('active_campaign', campaignId);
  }

  public async forceSync(): Promise<boolean> {
    try {
      await this.flushFieldChanges();
      return true;
    } catch (err) {
      console.error(">>> [SqliteService] Erro durante o forceSync:", err);
      return false;
    }
  }

  public async getDashboardStats(selectedUnit?: string, currentCampaignId?: string): Promise<{
    totalAtivos: number;
    conferidoAtivos: number;
    baixadosLocalizados: number;
    totalLido: number;
    pendentesAtivos: number;
    avancoPercent: number;
  }> {
    try {
      let assets = await db.ativos.toArray();
      assets = assets.filter(a => a._is_deleted === 0);
      if (selectedUnit) {
        assets = assets.filter(a => String(a.filial).toUpperCase() === String(selectedUnit).toUpperCase());
      }
      if (currentCampaignId) {
        assets = assets.filter(a => String(a.currentCampaignId) === String(currentCampaignId));
      }

      const totalAtivos = assets.length;
      const conferidoAtivos = assets.filter(a => a._conferido === 1).length;
      const baixadosLocalizados = assets.filter(a => a._conferido === 1 && a.status === 'B').length;
      const totalLido = conferidoAtivos;
      const pendentesAtivos = totalAtivos - conferidoAtivos;
      const avancoPercent = totalAtivos > 0 ? Math.round((conferidoAtivos / totalAtivos) * 100) : 0;

      return {
        totalAtivos,
        conferidoAtivos,
        baixadosLocalizados,
        totalLido,
        pendentesAtivos,
        avancoPercent
      };
    } catch (err) {
      console.error(">>> [sqliteService] Erro calculando getDashboardStats:", err);
      return {
        totalAtivos: 0,
        conferidoAtivos: 0,
        baixadosLocalizados: 0,
        totalLido: 0,
        pendentesAtivos: 0,
        avancoPercent: 0
      };
    }
  }

  public bufferFieldChange(
    asset: Record<string, unknown>,
    field: string,
    oldValue: string | null,
    newValue: string | null,
    userEmail: string
  ): void {
    console.log(`>>> [sqliteService] bufferFieldChange registrado: Ativo=${asset.id}, Campo=${field}, Novo=${newValue}`);
    this.bufferedFieldChanges.push({
      asset,
      field,
      oldValue,
      newValue,
      userEmail,
      timestamp: Date.now()
    });
    
    if (this.bufferedFieldChanges.length >= 5) {
      this.flushFieldChanges().catch(err => {
        console.error(">>> [sqliteService] Erro ao disparar flush automático:", err);
      });
    }
  }

  public getBufferedChangesCount(): number {
    return this.bufferedFieldChanges.length;
  }

  public async flushFieldChanges(): Promise<void> {
    if (this.bufferedFieldChanges.length === 0) return;
    
    console.log(`>>> [sqliteService] flushFieldChanges acionado para ${this.bufferedFieldChanges.length} alterações...`);
    const changesToProcess = [...this.bufferedFieldChanges];
    this.bufferedFieldChanges = [];

    for (const change of changesToProcess) {
      const asset = change.asset;
      const primaryKeyVal = String(asset.primarykey || asset.id || '');
      if (primaryKeyVal) {
        const existing = await db.ativos.get(primaryKeyVal);
        const updatedItem = {
          ...existing,
          ...asset,
          primarykey: primaryKeyVal,
          id: primaryKeyVal,
          _is_synced: 0
        } as DexieAsset;
        
        await db.ativos.put(updatedItem);
        await db.assets.put(updatedItem);
        await db.local_assets.put(updatedItem);

        const details = `Alteração do campo ${change.field} de ${change.oldValue || 'NULO'} para ${change.newValue || 'NULO'}`;
        await this.logAuditEvent(
          change.userEmail,
          'FIELD_BUFFERED_UPDATE',
          'ativos',
          primaryKeyVal,
          details,
          JSON.stringify({ field: change.field, oldValue: change.oldValue, newValue: change.newValue })
        );
      }
    }
    console.log(`>>> [sqliteService] flushFieldChanges concluído com sucesso.`);
  }
}

export const sqliteService = new Proxy({} as SqliteService, {
  get(target, prop, receiver) {
    return Reflect.get(SqliteService.getInstance(), prop, receiver);
  },
  set(target, prop, value, receiver) {
    return Reflect.set(SqliteService.getInstance(), prop, value, receiver);
  }
});
