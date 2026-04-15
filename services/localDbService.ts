
import { sqliteService } from './sqliteService';
import { Asset, UnitConfig, AuditLogEntry } from '../types';
import { SqlValue } from 'sql.js';

// Helper para converter objeto em colunas e valores SQL
const getUpsertSql = (table: string, obj: Record<string, unknown>) => {
  const keys = Object.keys(obj);
  const placeholders = keys.map(() => '?').join(', ');
  const columns = keys.join(', ');
  const sql = `INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`;
  return { sql, values: Object.values(obj) as SqlValue[] };
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
      for (const asset of assets) await localDb.assets.add(asset);
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
      return await sqliteService.query("SELECT * FROM assets") as unknown as Asset[];
    },
    where: (field: string) => ({
      equals: (value: SqlValue) => ({
        first: async () => {
          const res = await sqliteService.query(`SELECT * FROM assets WHERE ${field} = ? LIMIT 1`, [value]);
          return res[0] as unknown as Asset || null;
        },
        toArray: async () => {
          return await sqliteService.query(`SELECT * FROM assets WHERE ${field} = ?`, [value]) as unknown as Asset[];
        }
      })
    })
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
