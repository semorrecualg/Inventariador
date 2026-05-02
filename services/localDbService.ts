
import { sqliteService } from './sqliteService';
import { Asset, UnitConfig, AuditLogEntry } from '../types';
import { SqlValue } from 'sql.js';
import { DB_ASSET_COLUMNS } from '../constants/schema';

// Colunas válidas para a tabela assets (conforme definido em sqliteService.ts)
const ASSET_COLUMNS = DB_ASSET_COLUMNS;

// Helper para converter objeto em colunas e valores SQL, filtrando chaves inválidas
const getUpsertSql = (table: string, obj: Record<string, unknown>) => {
  const keys = Object.keys(obj).filter(k => {
    if (table === 'assets') return ASSET_COLUMNS.includes(k);
    return true; // Para outras tabelas, mantém comportamento original por enquanto
  });
  
  const placeholders = keys.map(() => '?').join(', ');
  const columns = keys.join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`;
  
  // Converte valores booleanos para 0/1 e objetos para string JSON se necessário
  const values = keys.map(k => {
    const val = obj[k];
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (val !== null && typeof val === 'object') return JSON.stringify(val);
    return val as SqlValue;
  });

  return { sql, values };
};

export const localDb = {
  assets: {
    add: async (asset: Asset) => {
      const { sql, values } = getUpsertSql('assets', asset as unknown as Record<string, unknown>);
      await sqliteService.execute(sql, values);
    },
    put: async (asset: Asset) => {
      await localDb.assets.add(asset);
    },
    bulkAdd: async (assets: Asset[]) => {
      const commands = assets.map(asset => {
        const { sql, values } = getUpsertSql('assets', asset as unknown as Record<string, unknown>);
        return { sql, params: values };
      });
      await sqliteService.executeBatch(commands);
    },
    bulkPut: async (assets: Asset[]) => {
      await localDb.assets.bulkAdd(assets);
    },
    update: async (id: string, changes: Partial<Asset>) => {
      const keys = Object.keys(changes);
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      const sql = `UPDATE assets SET ${setClause} WHERE id = ?`;
      await sqliteService.execute(sql, [...Object.values(changes) as SqlValue[], id]);
    },
    count: async () => {
      const res = await sqliteService.query("SELECT COUNT(*) as count FROM assets");
      return (res[0] as unknown as { count: number })?.count || 0;
    },
    clear: async () => {
      await sqliteService.execute("DELETE FROM assets");
    },
    toArray: async () => {
      const results = await sqliteService.query("SELECT * FROM assets") as Record<string, unknown>[];
      return results.map(row => {
        const asset = { ...row } as Record<string, unknown>;
        // Converte 0/1 de volta para boolean para o React
        ['_conferido', '_is_deleted', '_isNew', '_is_unitized', '_is_divergent_baixa', '_plaquetado', '_aprovado'].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(asset, key)) {
            asset[key] = asset[key] === 1;
          }
        });
        // Tenta fazer parse de campos que podem ser JSON
        ['DE_PARA', '_history'].forEach(key => {
          if (typeof asset[key] === 'string' && (asset[key].startsWith('{') || asset[key].startsWith('['))) {
            try { asset[key] = JSON.parse(asset[key]); } catch { /* ignore */ }
          }
        });
        return asset as unknown as Asset;
      });
    },
    getByLocationExact: async (unitId: string, location: string) => {
      const trimmedLoc = location.trim();
      const isOrphanVirtual = trimmedLoc === "PENDENTES DE ETIQUETAGEM / SEM ENDEREÇO";
      
      let sql;
      let params: SqlValue[];

      if (isOrphanVirtual) {
        sql = "SELECT * FROM assets WHERE (ENDERECO IS NULL OR trim(ENDERECO) = '') AND (UNIDADE_OPERACIONAL = ? OR _unitid = ?) AND _is_deleted = 0 ORDER BY CENTRODECUSTO ASC";
        params = [unitId.toUpperCase(), unitId.toUpperCase()];
      } else {
        sql = "SELECT * FROM assets WHERE ENDERECO = ? AND (UNIDADE_OPERACIONAL = ? OR _unitid = ?) AND _is_deleted = 0";
        params = [trimmedLoc, unitId.toUpperCase(), unitId.toUpperCase()];
      }
      
      console.log(`>>> [DBA] EXECUTANDO QUERY DE ATIVOS (${isOrphanVirtual ? 'ÓRFÃOS' : 'EXATA'}):`);
      console.log(`>>> [DBA] SQL: ${sql}`);
      console.log(`>>> [DBA] PARAMS:`, params);
      
      const results = await sqliteService.query(sql, params) as Record<string, unknown>[];
      console.log(`>>> [DBA] RESULTADO DA QUERY: ${results.length} registros encontrados.`);
      
      return results.map(row => {
        const asset = { ...row } as Record<string, unknown>;
        ['_conferido', '_is_deleted', '_isNew', '_is_unitized', '_is_divergent_baixa', '_plaquetado', '_aprovado'].forEach(key => {
          if (Object.prototype.hasOwnProperty.call(asset, key)) {
            asset[key] = asset[key] === 1;
          }
        });
        return asset as unknown as Asset;
      });
    },
    where: (field: string) => ({
      equals: (value: SqlValue | SqlValue[]) => ({
        first: async () => {
          if (Array.isArray(value)) {
            // Suporte para chaves compostas ex: [ETIQUETA+UNIDADE_OPERACIONAL]
            const fields = field.replace('[', '').replace(']', '').split('+');
            const whereClause = fields.map(f => `${f} = ?`).join(' AND ');
            const res = await sqliteService.query(`SELECT * FROM assets WHERE ${whereClause} LIMIT 1`, value);
            return res[0] as unknown as Asset || null;
          }
          const res = await sqliteService.query(`SELECT * FROM assets WHERE ${field} = ? LIMIT 1`, [value]);
          return res[0] as unknown as Asset || null;
        },
        toArray: async () => {
          if (Array.isArray(value)) {
            const fields = field.replace('[', '').replace(']', '').split('+');
            const whereClause = fields.map(f => `${f} = ?`).join(' AND ');
            return await sqliteService.query(`SELECT * FROM assets WHERE ${whereClause}`, value) as unknown as Asset[];
          }
          return await sqliteService.query(`SELECT * FROM assets WHERE ${field} = ?`, [value]) as unknown as Asset[];
        }
      })
    }),
    getLocationsWithStats: async (unitId: string, searchTerm = '') => {
      // 1. Busca localidades normais
      let sql = `
        SELECT 
          ENDERECO as displayName,
          COUNT(*) as total,
          SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as checked
        FROM assets
        WHERE (UNIDADE_OPERACIONAL = ? OR _unitid = ?)
          AND _is_deleted = 0
          AND ENDERECO IS NOT NULL AND trim(ENDERECO) != ''
      `;
      const params: SqlValue[] = [
        unitId.toUpperCase(), 
        unitId.toUpperCase()
      ];

      if (searchTerm) {
        sql += ` AND (ENDERECO LIKE ? COLLATE NOCASE)`;
        params.push(`%${searchTerm}%`);
      }

      sql += ` GROUP BY ENDERECO ORDER BY ENDERECO COLLATE NOCASE`;
      
      const results = await sqliteService.query(sql, params) as { displayName: string; total: number; checked: number }[];
      
      // 2. Busca órfãos (Sem Endereço)
      const orphanSql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as checked
        FROM assets
        WHERE (UNIDADE_OPERACIONAL = ? OR _unitid = ?)
          AND _is_deleted = 0
          AND (ENDERECO IS NULL OR trim(ENDERECO) = '')
      `;
      const orphanParams: SqlValue[] = [unitId.toUpperCase(), unitId.toUpperCase()];
      const orphanResults = await sqliteService.query(orphanSql, orphanParams) as { total: number; checked: number }[];
      
      const finalResults = results.map(r => ({
        displayName: r.displayName || 'SEM ENDERECO',
        total: r.total,
        checked: r.checked,
        locKey: (r.displayName || 'SEM_ENDERECO').toString().toUpperCase().replace(/[^A-Z0-9]/g, ''),
        status: 'normal'
      }));

      // Adiciona o local virtual se houver órfãos
      if (orphanResults.length > 0 && orphanResults[0].total > 0) {
        const orphanCount = orphanResults[0].total;
        const orphanChecked = orphanResults[0].checked;
        
        // Verifica se o termo de busca bate com o nome virtual
        const virtualName = "PENDENTES DE ETIQUETAGEM / SEM ENDEREÇO";
        if (!searchTerm || virtualName.toUpperCase().includes(searchTerm.toUpperCase())) {
          finalResults.unshift({
            displayName: virtualName,
            total: orphanCount,
            checked: orphanChecked,
            locKey: 'PENDENTES_ORFAOS',
            status: 'attention'
          });
        }
      }

      console.log(`>>> [DBA] Localidades carregadas do banco. Total: ${finalResults.length} (incluindo órfãos se existirem)`);
      
      return finalResults;
    }
  },
  localidades: {
    search: async (term: string) => {
      const sql = "SELECT * FROM localidades WHERE DESCRICAO LIKE ? COLLATE NOCASE ORDER BY DESCRICAO";
      return await sqliteService.query(sql, [`%${term}%`]) as { ID: string; DESCRICAO: string }[];
    }
  },
  auditLogs: {
    add: async (log: AuditLogEntry) => {
      const { sql, values } = getUpsertSql('audit_logs', log as unknown as Record<string, unknown>);
      await sqliteService.execute(sql, values);
    },
    bulkAdd: async (logs: AuditLogEntry[]) => {
      for (const log of logs) await localDb.auditLogs.add(log);
    },
    count: async () => {
      const res = await sqliteService.query("SELECT COUNT(*) as count FROM audit_logs");
      return (res[0] as unknown as { count: number })?.count || 0;
    },
    clear: async () => {
      await sqliteService.execute("DELETE FROM audit_logs");
    },
    reverse: () => ({
      limit: (n: number) => ({
        toArray: async () => {
          return await sqliteService.query(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`, [n]) as unknown as AuditLogEntry[];
        }
      })
    })
  },
  unitConfigs: {
    put: async (config: UnitConfig) => {
      const { sql, values } = getUpsertSql('unit_configs', config as unknown as Record<string, unknown>);
      await sqliteService.execute(sql, values);
    },
    toArray: async () => {
      return await sqliteService.query("SELECT * FROM unit_configs") as unknown as UnitConfig[];
    },
    clear: async () => {
      await sqliteService.execute("DELETE FROM unit_configs");
    },
    count: async () => {
      const res = await sqliteService.query("SELECT COUNT(*) as count FROM unit_configs");
      return (res[0] as unknown as { count: number })?.count || 0;
    }
  },
  campaigns: {
    clear: async () => {
      await sqliteService.execute("DELETE FROM campaigns");
    }
  },
  // Mock de transação para evitar quebra de código legado
  transaction: async (...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === 'function') {
      return await (callback as () => Promise<void>)();
    }
  }
};

export async function requestPersistentStorage() {
  console.log(">>> [DBA] SQLite Nativo configurado. Persistência via System File (Simulado).");
  return true;
}

export async function isStoragePersisted() {
  return true;
}
