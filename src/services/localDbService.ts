
import { sqliteService } from './sqliteService';
import { Asset, UnitConfig, AuditLogEntry } from '../types';
import { SqlValue } from 'sql.js';
import { DB_ASSET_COLUMNS } from '../constants/schema';

// Colunas válidas para a tabela assets (conforme definido em sqliteService.ts)
const ASSET_COLUMNS = DB_ASSET_COLUMNS;

// Helper para converter objeto em colunas e valores SQL, filtrando chaves inválidas
const getUpsertSql = (table: string, obj: Record<string, unknown>) => {
  const keys = Object.keys(obj).filter(k => {
    if (table === 'inventario_mestre') return ASSET_COLUMNS.includes(k);
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
      const { sql, values } = getUpsertSql('inventario_mestre', asset as unknown as Record<string, unknown>);
      await sqliteService.execute(sql, values);
    },
    put: async (asset: Asset) => {
      await localDb.assets.add(asset);
    },
    bulkAdd: async (assets: Asset[]) => {
      const commands = assets.map(asset => {
        const { sql, values } = getUpsertSql('inventario_mestre', asset as unknown as Record<string, unknown>);
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
      const sql = `UPDATE inventario_mestre SET ${setClause} WHERE id = ?`;
      await sqliteService.execute(sql, [...Object.values(changes) as SqlValue[], id]);
    },
    count: async () => {
      const res = await sqliteService.query("SELECT COUNT(*) as count FROM inventario_mestre");
      return (res[0] as unknown as { count: number })?.count || 0;
    },
    clear: async () => {
      await sqliteService.execute("DELETE FROM inventario_mestre");
    },
    toArray: async () => {
      const results = await sqliteService.query("SELECT * FROM inventario_mestre") as Record<string, unknown>[];
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
    where: (field: string) => ({
      equals: (value: SqlValue | SqlValue[]) => ({
        first: async () => {
          if (Array.isArray(value)) {
            // Suporte para chaves compostas ex: [ETIQUETA+UNIDADE_OPERACIONAL]
            const fields = field.replace('[', '').replace(']', '').split('+');
            const whereClause = fields.map(f => `${f} = ?`).join(' AND ');
            const res = await sqliteService.query(`SELECT * FROM inventario_mestre WHERE ${whereClause} LIMIT 1`, value);
            return res[0] as unknown as Asset || null;
          }
          const res = await sqliteService.query(`SELECT * FROM inventario_mestre WHERE ${field} = ? LIMIT 1`, [value]);
          return res[0] as unknown as Asset || null;
        },
        toArray: async () => {
          if (Array.isArray(value)) {
            const fields = field.replace('[', '').replace(']', '').split('+');
            const whereClause = fields.map(f => `${f} = ?`).join(' AND ');
            return await sqliteService.query(`SELECT * FROM inventario_mestre WHERE ${whereClause}`, value) as unknown as Asset[];
          }
          return await sqliteService.query(`SELECT * FROM inventario_mestre WHERE ${field} = ?`, [value]) as unknown as Asset[];
        }
      })
    }),
    getLocationsWithStats: async (unitId: string, searchTerm = '') => {
      let sql = `
        SELECT 
          COALESCE(_localMaster, ENDERECO, LOCALIZACAO, 'SEM LOCAL') as displayName,
          COUNT(*) as total,
          SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as checked
        FROM inventario_mestre
        WHERE (_unitid = ? OR UNIDADE_OPERACIONAL = ? OR GRUPO_EMPRESARIAL = ?)
          AND _is_deleted = 0
      `;
      const params: SqlValue[] = [
        unitId.toUpperCase(), 
        unitId.toUpperCase(), 
        unitId.toUpperCase()
      ];

      if (searchTerm) {
        sql += ` AND (COALESCE(_localMaster, ENDERECO, LOCALIZACAO, 'SEM LOCAL') LIKE ? COLLATE NOCASE)`;
        params.push(`%${searchTerm}%`);
      }

      sql += ` GROUP BY COALESCE(_localMaster, ENDERECO, LOCALIZACAO, 'SEM LOCAL') ORDER BY displayName COLLATE NOCASE`;
      
      const results = await sqliteService.query(sql, params) as { displayName: string; total: number; checked: number }[];
      return results.map(r => ({
        displayName: r.displayName,
        total: r.total,
        checked: r.checked,
        locKey: r.displayName.toString().toUpperCase().replace(/[^A-Z0-9]/g, '')
      }));
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
  inventario_mestre: {
    bulkPut: async (items: Asset[]) => {
      const commands = items.map(item => {
        const { sql, values } = getUpsertSql('inventario_mestre', item);
        return { sql, params: values };
      });
      await sqliteService.executeBatch(commands);
    },
    toArray: async (): Promise<Asset[]> => {
      return await sqliteService.query("SELECT * FROM inventario_mestre") as unknown as Asset[];
    }
  },
  users: {
    add: async (user: User) => {
      const { sql, values } = getUpsertSql('users', user as unknown as Record<string, unknown>);
      await sqliteService.execute(sql, values);
    },
    bulkAdd: async (users: User[]) => {
      const commands = users.map(user => {
        const { sql, values } = getUpsertSql('users', user as unknown as Record<string, unknown>);
        return { sql, params: values };
      });
      await sqliteService.executeBatch(commands);
    },
    toArray: async (): Promise<User[]> => {
      const results = await sqliteService.query("SELECT * FROM users");
      return results.map(row => ({
        ...row,
        is_admin: row.is_admin === 1,
        isAdmin: row.is_admin === 1,
      })) as unknown as User[];
    },
    clear: async () => {
      await sqliteService.execute("DELETE FROM users");
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
