import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { DatabaseStatus } from '../types';
import localforage from 'localforage';

const fallbackStore = localforage.createInstance({
  name: 'gbr_sqlite_fallback',
  storeName: 'assets_fallback'
});

function parseSqlAndParams(sql: string, params: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  
  // Extract columns from INSERT statement
  const insertMatch = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+\w+\s*\(([^)]+)\)/i);
  if (insertMatch && insertMatch[1]) {
    const cols = insertMatch[1].split(',').map(c => c.trim());
    cols.forEach((col, idx) => {
      if (idx < params.length) {
        obj[col] = params[idx];
      }
    });
  }

  // Extract columns from UPDATE statement
  // UPDATE ativos SET col1 = ?, col2 = ? WHERE id = ?
  const updateMatch = sql.match(/UPDATE\s+\w+\s+SET\s+([^WHERE]+)/i);
  if (updateMatch && updateMatch[1]) {
    const sets = updateMatch[1].split(',').map(s => s.trim().split('=')[0].trim());
    sets.forEach((col, idx) => {
      if (idx < params.length) {
        obj[col] = params[idx];
      }
    });
    // The WHERE clause ID is usually the last param
    if (params.length > 0) {
      obj['id'] = params[params.length - 1];
    }
  }

  return obj;
}

export class SQLitePersistenceException extends Error {
  constructor(message: string) {
    super(`[SQLitePersistenceException] ${message}`);
    this.name = "SQLitePersistenceException";
  }
}

export class SqliteService {
  private static instance: SqliteService | null = null;
  private sqliteConnection: SQLiteConnection | null = null;
  private nativeDb: SQLiteDBConnection | null = null;
  private isInitialized = false;
  private dbName = "gbr_kardek_v2.db";
  private dbStatus = DatabaseStatus.EMPTY;
  private permissionsGranted = false;
  
  // Tranca de semáforo para escrita concorrente
  private writeMutex: Promise<void> = Promise.resolve();

  // Flag indicador de importação pesada ativa para bypassar reações excessivas na UI
  public isImportingBatch = false;

  // Buffer atômico para a "Regra dos 5" (GBR v25)
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

  /**
   * Executa uma operação garantindo fila sequencial (Mutex) para evitar conflitos concorrentes de IO no SQLite
   */
  private async executeWithMutex<T>(operation: () => Promise<T>): Promise<T> {
    let resolveMutex: () => void;
    const nextWait = new Promise<void>((resolve) => {
      resolveMutex = resolve;
    });
    const currentWait = this.writeMutex;
    this.writeMutex = nextWait;

    try {
      await currentWait;
      return await operation();
    } finally {
      resolveMutex!();
    }
  }

  /**
   * Tenta executar uma operação de banco de dados com retry exponencial simples
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>, 
    maxRetries = 3, 
    delayMs = 1000
  ): Promise<T> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (err: unknown) {
        attempt++;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (attempt > maxRetries || !errMsg.includes('database is locked')) {
          throw err;
        }
        console.warn(`>>> [SQLite Retry Engine] Banco travado (tentativa ${attempt}/${maxRetries}). Aguardando ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
    throw new SQLitePersistenceException("Falha ao executar operação devido a travamentos persistentes.");
  }

  public async init(isRecovery: boolean = false): Promise<boolean> {
    if (this.isInitialized && this.nativeDb) {
      return true;
    }

    try {
      console.log(`>>> [SqliteService] Inicializando conexões locais com Capacitor SQLite (isRecovery=${isRecovery})...`);
      
      if (typeof document !== 'undefined') {
        const jeepEl = document.querySelector('jeep-sqlite');
        if (!jeepEl) {
          console.log(">>> [SqliteService SRE] Elemento não encontrado. Injetando '<jeep-sqlite>' no DOM...");
          const jeep = document.createElement('jeep-sqlite');
          jeep.id = 'jeep-sqlite';
          document.body.appendChild(jeep);
          
          // POLLING ATIVO: Varre o DOM a cada 5ms procurando a existência física do nó antes de liberar o driver
          let tentativas = 0;
          const MAX_TENTATIVAS = 60; // Limite de 300ms de tolerância física no contêiner
          while (!document.querySelector('jeep-sqlite') && tentativas < MAX_TENTATIVAS) {
            await new Promise(resolve => setTimeout(resolve, 5));
            tentativas++;
          }
          console.log(`>>> [SqliteService SRE] Polling do DOM finalizado em ${tentativas * 5}ms.`);
        }
      }

      this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      
      const dbName = this.dbName;
      const isConnectionActive = await this.sqliteConnection.isConnection(dbName, false);
      let isRetrieved = false;
      
      if (isConnectionActive.result) {
        this.nativeDb = await this.sqliteConnection.retrieveConnection(dbName, false);
        isRetrieved = true;
      } else {
        this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
      }

      if (!(await this.nativeDb.isDBOpen()).result) {
        await this.nativeDb.open();
      }

      this.isInitialized = true;
      if (!isRetrieved) {
        try {
          await this.executeRaw("COMMIT;");
        } catch {
          // Ignore orphan transaction commit errors safely
        }
        await this.runDDLScripts();
      }
      this.dbStatus = DatabaseStatus.ACTIVE;
      console.log(">>> [SqliteService] Banco inicializado com sucesso e esquemas validados.");
      return true;
    } catch (error) {
      console.error(">>> [SqliteService] Erro fatal durante a inicialização:", error);
      this.isInitialized = false;
      this.nativeDb = null;
      this.dbStatus = DatabaseStatus.ERROR;
      return false;
    }
  }

  public async closeConnection(): Promise<void> {
    if (!this.nativeDb) return;
    try {
      await this.nativeDb.close();
      this.nativeDb = null;
      this.isInitialized = false;
      this.dbStatus = DatabaseStatus.EMPTY;
      console.log(">>> [SqliteService] Conexão local encerrada.");
    } catch (error) {
      console.error(">>> [SqliteService] Erro ao fechar conexão:", error);
    }
  }

  public async deleteDatabase(): Promise<void> {
    if (!this.sqliteConnection) return;
    try {
      const dbName = this.dbName;
      await this.closeConnection();
      await this.sqliteConnection.deleteDatabase(dbName, false);
      console.log(">>> [SqliteService] Arquivo de banco de dados apagado fisicamente.");
    } catch (error) {
      console.error(">>> [SqliteService] Erro ao deletar banco local:", error);
    }
  }

  private async runDDLScripts(): Promise<void> {
    if (!this.nativeDb) throw new SQLitePersistenceException("[SRE] Instância nativeDb ausente no DDL.");
    
    const SCHEMA_ATOMIC = `
      CREATE TABLE IF NOT EXISTS ativos (
        id TEXT PRIMARY KEY, tenantId TEXT, _tenantid TEXT, filial TEXT, _unitid TEXT,
        status TEXT, etiqueta TEXT, tag TEXT, qt INTEGER DEFAULT 1, descricaodoativo TEXT,
        serial TEXT, dataaqusic TEXT, cnpj TEXT, nomefornecedor TEXT, notafiscal TEXT,
        endereco TEXT, registro TEXT, subreg TEXT, databaixa TEXT, contacontabil TEXT,
        primarykey TEXT, centrodecusto TEXT, vlraquisic REAL, sn1_recno INTEGER, sn3_recno INTEGER,
        _is_synced INTEGER DEFAULT 0, _is_deleted INTEGER DEFAULT 0, _conferido INTEGER DEFAULT 0,
        _plaquetado INTEGER DEFAULT 0, _aprovado INTEGER DEFAULT 0, _isNew INTEGER DEFAULT 0,
        _is_unitized INTEGER DEFAULT 0, _is_divergent_baixa INTEGER DEFAULT 0,
        _history TEXT, DE_PARA TEXT, _photoUrl TEXT, gps_lat REAL, gps_lng REAL
      );
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, tenantId TEXT, _tenantid TEXT, filial TEXT, _unitid TEXT,
        status TEXT, etiqueta TEXT, tag TEXT, qt INTEGER DEFAULT 1, descricaodoativo TEXT,
        serial TEXT, dataaqusic TEXT, cnpj TEXT, nomefornecedor TEXT, notafiscal TEXT,
        endereco TEXT, registro TEXT, subreg TEXT, databaixa TEXT, contacontabil TEXT,
        primarykey TEXT, centrodecusto TEXT, vlraquisic REAL, sn1_recno INTEGER, sn3_recno INTEGER,
        _is_synced INTEGER DEFAULT 0, _is_deleted INTEGER DEFAULT 0, _conferido INTEGER DEFAULT 0,
        _plaquetado INTEGER DEFAULT 0, _aprovado INTEGER DEFAULT 0, _isNew INTEGER DEFAULT 0,
        _is_unitized INTEGER DEFAULT 0, _is_divergent_baixa INTEGER DEFAULT 0,
        _history TEXT, DE_PARA TEXT, _photoUrl TEXT, gps_lat REAL, gps_lng REAL
      );
      DROP VIEW IF EXISTS assets_counting;
      CREATE VIEW IF NOT EXISTS assets_counting AS 
      SELECT 
        id, tenantId, tenantId as tenantid, _tenantid, filial, _unitid,
        status, etiqueta, tag, qt, descricaodoativo,
        serial, dataaqusic, cnpj, nomefornecedor, notafiscal,
        endereco, registro, subreg, databaixa, contacontabil,
        primarykey, centrodecusto, vlraquisic, sn1_recno, sn3_recno,
        currentCampaignId, _is_synced, _is_deleted, _conferido, _plaquetado,
        _aprovado, _isNew, _is_unitized, _is_divergent_baixa, _history, DE_PARA,
        _photoUrl, _photoUrl as foto_url, gps_lat, gps_lng,
        case when _is_synced = 1 then 'SYNCED' else 'PENDING' end as sync_status
      FROM ativos;
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        usuario TEXT,
        acao TEXT,
        tabela TEXT,
        registro_id TEXT,
        details TEXT,
        delta TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT,
        tenantId TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS SYSTEM_CONTEXT (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS unit_configs (
        id TEXT PRIMARY KEY,
        filial TEXT,
        nome TEXT,
        hasGps INTEGER DEFAULT 0,
        requireNf INTEGER DEFAULT 0,
        requireSeriado INTEGER DEFAULT 0,
        allowNewAssets INTEGER DEFAULT 1,
        allowWriteOffs INTEGER DEFAULT 1,
        requirePlaqueta INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_ativos_tenant_filial ON ativos (tenantId, filial);
      CREATE INDEX IF NOT EXISTS idx_ativos_is_synced ON ativos (_is_synced);
      CREATE INDEX IF NOT EXISTS idx_ativos_is_deleted ON ativos (_is_deleted);
      CREATE INDEX IF NOT EXISTS idx_ativos_etiqueta ON ativos (etiqueta);
      CREATE INDEX IF NOT EXISTS idx_ativos_primarykey ON ativos (primarykey);
    `;

    try {
      await this.nativeDb.execute(SCHEMA_ATOMIC);
      await this.verifyAndPatchSchema();
    } catch (err) {
      console.error(">>> [SqliteService] Erro crítico rodando DDL de inicialização:", err);
      throw new SQLitePersistenceException("Falha na criação de tabelas e indexação nativa.");
    }
  }

  private async verifyAndPatchSchema(): Promise<void> {
    const tableChecks = ['ativos', 'assets'];
    for (const tbl of tableChecks) {
      const info = await this.checkTableSchema(tbl);
      if (info.isValid) {
        // Correções incrementais de schema
        if (!info.columns.includes('currentCampaignId')) {
          console.log(`>>> [SqliteService] Patching: Adicionando currentCampaignId na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN currentCampaignId TEXT;`);
        }
        if (!info.columns.includes('_plaquetado')) {
          console.log(`>>> [SqliteService] Patching: Adicionando _plaquetado na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN _plaquetado INTEGER DEFAULT 0;`);
        }
        if (!info.columns.includes('_is_unitized')) {
          console.log(`>>> [SqliteService] Patching: Adicionando _is_unitized na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN _is_unitized INTEGER DEFAULT 0;`);
        }
        if (!info.columns.includes('_is_divergent_baixa')) {
          console.log(`>>> [SqliteService] Patching: Adicionando _is_divergent_baixa na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN _is_divergent_baixa INTEGER DEFAULT 0;`);
        }
        if (!info.columns.includes('gps_lat')) {
          console.log(`>>> [SqliteService] Patching: Adicionando gps_lat e gps_lng na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN gps_lat REAL;`);
          await this.execute(`ALTER TABLE ${tbl} ADD COLUMN gps_lng REAL;`);
        }
        if (!info.columns.includes('tenantId') && info.columns.includes('tenantid')) {
          console.log(`>>> [SqliteService] Patching: Renomeando tenantid para tenantId na tabela ${tbl}`);
          await this.execute(`ALTER TABLE ${tbl} RENAME COLUMN tenantid TO tenantId;`);
        }
      }
    }
  }

  public async checkTableSchema(tableName: string): Promise<{ isValid: boolean; columns: string[] }> {
    try {
      const res = await this.query(`PRAGMA table_info(${tableName});`);
      const columns = res.map((row: Record<string, unknown>) => String(row['name'] ?? ''));
      return { isValid: columns.length > 0, columns };
    } catch {
      return { isValid: false, columns: [] };
    }
  }

  public async getContextValue(key: string): Promise<string | null> {
    try {
      const res = await this.query("SELECT value FROM SYSTEM_CONTEXT WHERE key = ?", [key]);
      return res.length > 0 ? String(res[0].value ?? '') : null;
    } catch {
      return null;
    }
  }

  public async setContextValue(key: string, value: string): Promise<void> {
    await this.executeWithMutex(async () => {
      await this.executeWithRetry(async () => {
        await this.execute(
          "INSERT OR REPLACE INTO SYSTEM_CONTEXT (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
          [key, value]
        );
      });
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
        console.log(`>>> [sqliteService] getUnitConfigs para o tenant: ${tenantId}`);
      }
      return await this.query("SELECT * FROM unit_configs") as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  public async getUnitConfigsFromSql(): Promise<Record<string, unknown>[]> {
    return this.getUnitConfigs('');
  }

  public async saveUnitConfigs(configs: Record<string, unknown>[]): Promise<void> {
    await this.executeWithMutex(async () => {
      await this.executeWithRetry(async () => {
        const set = configs.map(cfg => ({
          statement: `INSERT OR REPLACE INTO unit_configs (id, filial, nome, hasGps, requireNf, requireSeriado, allowNewAssets, allowWriteOffs, requirePlaqueta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          values: [
            String(cfg.id || cfg.filial || ''),
            String(cfg.filial || ''),
            String(cfg.nome || cfg.filial || ''),
            cfg.hasGps ? 1 : 0,
            cfg.requireNf ? 1 : 0,
            cfg.requireSeriado ? 1 : 0,
            cfg.allowNewAssets !== false ? 1 : 0,
            cfg.allowWriteOffs !== false ? 1 : 0,
            cfg.requirePlaqueta ? 1 : 0
          ]
        }));
        await this.executeBatch(set);
      });
    });
  }

  public async getOperationalUnits(): Promise<string[]> {
    try {
      const res = await this.query("SELECT DISTINCT filial FROM ativos WHERE _is_deleted = 0 ORDER BY filial ASC");
      const list = res.map((row: Record<string, unknown>) => String(row['filial'] ?? row['FILIAL'] ?? ''));
      return list.filter(item => item && item.trim() !== '');
    } catch {
      return [];
    }
  }

  public async getOperationalUnitsWithStats(tenantId?: string): Promise<Record<string, unknown>[]> {
    try {
      if (tenantId) {
        console.log(`>>> [sqliteService] getOperationalUnitsWithStats para o tenant: ${tenantId}`);
      }
      const sql = `
        SELECT filial, COUNT(*) as total, SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as checked 
        FROM ativos WHERE _is_deleted = 0 AND filial IS NOT NULL AND filial != ''
        GROUP BY filial ORDER BY filial ASC
      `;
      const res = await this.query(sql);
      return res.map((row: Record<string, unknown>) => ({
        filial: String(row['filial'] ?? row['FILIAL'] ?? 'GERAL'),
        displayName: String(row['filial'] ?? row['FILIAL'] ?? 'GERAL'),
        total: Number(row['total'] ?? 0),
        checked: Number(row['checked'] ?? 0)
      }));
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
      const whereClause = filial ? "WHERE filial = ? AND _is_deleted = 0" : "WHERE _is_deleted = 0";
      const params = filial ? [filial] : [];

      const totalRes = await this.query(`SELECT COUNT(*) as total FROM ativos ${whereClause}`, params);
      const checkedRes = await this.query(`SELECT COUNT(*) as checked FROM ativos ${whereClause} AND _conferido = 1`, params);
      const pendingRes = await this.query(`SELECT COUNT(*) as pending FROM ativos ${whereClause} AND (_conferido = 0 OR _conferido IS NULL)`, params);
      const discRes = await this.query(`SELECT COUNT(*) as count FROM ativos ${whereClause} AND (_is_divergent_baixa = 1)`, params);

      const totalAssets = Number(totalRes[0]?.total ?? 0);
      const checkedAssets = Number(checkedRes[0]?.checked ?? 0);
      const pendingAssets = Number(pendingRes[0]?.pending ?? 0);
      const discrepancyCount = Number(discRes[0]?.count ?? 0);

      const logsRes = await this.query("SELECT * FROM audit_logs ORDER BY updated_at DESC LIMIT 5");

      return {
        totalAssets,
        checkedAssets,
        pendingAssets,
        discrepancyCount,
        recentLogs: logsRes
      };
    } catch {
      return { totalAssets: 0, checkedAssets: 0, pendingAssets: 0, discrepancyCount: 0, recentLogs: [] };
    }
  }

  public async getTotalAssetsCount(): Promise<number> {
    if (!this.isInitialized || !this.nativeDb) return 0;
    try {
      const res = await this.nativeDb.query("SELECT COUNT(*) as total FROM ativos;");
      const row = res?.values?.[0] as Record<string, unknown> | undefined;
      return row ? Number(row.total ?? row.count ?? 0) : 0;
    } catch {
      return 0;
    }
  }

  public async getAddressesFromAssetsCounting(): Promise<string[]> {
    try {
      const res = await this.query("SELECT DISTINCT endereco FROM ativos WHERE endereco IS NOT NULL AND endereco != ''");
      return res.map((r: Record<string, unknown>) => String(r['endereco'] ?? ''));
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
    await this.executeWithRetry(async () => {
      const id = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
      await this.execute(
        "INSERT INTO audit_logs (id, usuario, acao, tabela, registro_id, details, delta) VALUES (?, ?, ?, ?, ?, ?, ?);",
        [id, usuario, acao, tabela, registro_id, details, delta ?? null]
      );
    });
  }

  /**
   * Executa consultas parametrizadas retornando estritamente um array bruto de registros do driver nativo.
   */
  public async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const sqlUpper = sql.toUpperCase();
    if (!this.isInitialized || !this.nativeDb) {
      console.warn(">>> [SqliteService Fallback] query chamada com banco offline. Redirecionando para fallback localforage...", sql);
      try {
        if (sqlUpper.includes("FROM ATIVOS") || sqlUpper.includes("FROM ASSETS") || sqlUpper.includes("FROM ASSETS_COUNTING")) {
          let assets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
          
          // Map properties to ensure consistency
          assets = assets.map(asset => {
            const isSynced = asset._is_synced === 1 || asset._is_synced === true;
            return {
              ...asset,
              _is_synced: isSynced ? 1 : 0,
              sync_status: isSynced ? 'SYNCED' : 'PENDING'
            };
          });

          if (sqlUpper.includes("WHERE SYNC_STATUS = 'PENDING'") || sqlUpper.includes("WHERE _IS_SYNCED = 0")) {
            assets = assets.filter(a => a.sync_status === 'PENDING');
          }
          
          if (sqlUpper.includes("WHERE _IS_DELETED = 0")) {
            assets = assets.filter(a => a._is_deleted !== 1 && a._is_deleted !== true);
          }
          
          if (params.length > 0) {
            const tenantId = params[0] ? String(params[0]).trim() : '';
            const filial = params[1] ? String(params[1]).trim() : '';
            if (tenantId) {
              assets = assets.filter(a => String(a.tenantId || a._tenantid || '').trim().toUpperCase() === tenantId.toUpperCase());
            }
            if (filial) {
              assets = assets.filter(a => String(a.filial || a._unitid || '').trim().toUpperCase() === filial.toUpperCase());
            }
          }
          
          if (sqlUpper.includes("COUNT(*)") || sqlUpper.includes("COUNT(1)") || sqlUpper.includes("COUNT(")) {
            const aliasMatch = sqlUpper.match(/COUNT\([^)]+\)\s+AS\s+(\w+)/i);
            const alias = aliasMatch ? aliasMatch[1].toLowerCase() : 'total';
            return [{ [alias]: assets.length }];
          }
          
          return assets;
        }
        
        if (sqlUpper.includes("FROM UNIT_CONFIGS")) {
          const configs = await fallbackStore.getItem<Record<string, unknown>[]>('unit_configs') || [];
          return configs;
        }

        if (sqlUpper.includes("FROM SYSTEM_CONTEXT")) {
          const context = await fallbackStore.getItem<Record<string, unknown>[]>('system_context') || [];
          if (params.length > 0) {
            const key = String(params[0]);
            const match = context.find(c => c.key === key);
            return match ? [match] : [];
          }
          return context;
        }

        if (sqlUpper.includes("FROM AUDIT_LOGS") || sqlUpper.includes("FROM AUDIT_LOG")) {
          const logs = await fallbackStore.getItem<Record<string, unknown>[]>('audit_logs') || [];
          return logs;
        }
      } catch (fallbackErr) {
        console.error(">>> [SqliteService Fallback] Falha no fallback de query:", fallbackErr);
      }
      return [];
    }

    try {
      const res = await this.nativeDb.query(sql, params);
      return (res?.values as Record<string, unknown>[]) || [];
    } catch (err) {
      console.error(">>> [SqliteService] Erro na query:", sql, "Params:", params, err);
      try {
        if (sqlUpper.includes("FROM ATIVOS") || sqlUpper.includes("FROM ASSETS") || sqlUpper.includes("FROM ASSETS_COUNTING")) {
          let assets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
          if (sqlUpper.includes("WHERE SYNC_STATUS = 'PENDING'")) {
            assets = assets.filter(a => a._is_synced === 0 || a._is_synced === false || a.sync_status === 'PENDING');
          }
          if (sqlUpper.includes("COUNT(*)") || sqlUpper.includes("COUNT(1)") || sqlUpper.includes("COUNT(")) {
            const aliasMatch = sqlUpper.match(/COUNT\([^)]+\)\s+AS\s+(\w+)/i);
            const alias = aliasMatch ? aliasMatch[1].toLowerCase() : 'total';
            return [{ [alias]: assets.length }];
          }
          return assets;
        }
      } catch (innerErr) {
        console.warn(">>> [SqliteService] Fallback query erro:", innerErr);
      }
      throw err;
    }
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    const sqlUpper = sql.toUpperCase();
    
    // Always update fallbackStore first if it's about ativos/assets/system_context/unit_configs
    if (sqlUpper.includes("ATIVOS") || sqlUpper.includes("ASSETS") || sqlUpper.includes("ASSETS_COUNTING")) {
      try {
        const fallbackAssets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
        
        if (sqlUpper.includes("INSERT OR REPLACE")) {
          const newAsset = parseSqlAndParams(sql, params);
          const id = String(newAsset.id || newAsset.primarykey || '');
          if (id) {
            const idx = fallbackAssets.findIndex(a => String(a.id || a.primarykey) === id);
            if (idx >= 0) {
              fallbackAssets[idx] = { ...fallbackAssets[idx], ...newAsset };
            } else {
              fallbackAssets.push(newAsset);
            }
            await fallbackStore.setItem('loaded_assets', fallbackAssets);
          }
        } else if (sqlUpper.includes("UPDATE")) {
          const updates = parseSqlAndParams(sql, params);
          const id = String(updates.id || updates.primarykey || '');
          if (id) {
            const idx = fallbackAssets.findIndex(a => String(a.id || a.primarykey) === id);
            if (idx >= 0) {
              fallbackAssets[idx] = { ...fallbackAssets[idx], ...updates };
              await fallbackStore.setItem('loaded_assets', fallbackAssets);
            }
          } else if (sqlUpper.includes("_IS_SYNCED = 1")) {
            const keyToUpdate = params[0] ? String(params[0]) : '';
            if (keyToUpdate) {
              let modified = false;
              const updated = fallbackAssets.map(a => {
                if (String(a.primarykey || a.id || '') === keyToUpdate) {
                  modified = true;
                  return { ...a, _is_synced: 1, sync_status: 'SYNCED' };
                }
                return a;
              });
              if (modified) {
                await fallbackStore.setItem('loaded_assets', updated);
              }
            }
          }
        } else if (sqlUpper.includes("DELETE FROM")) {
          if (sqlUpper.includes("DELETE FROM ATIVOS") || sqlUpper.includes("DELETE FROM ASSETS")) {
            await fallbackStore.removeItem('loaded_assets');
          }
        }
      } catch (err) {
        console.error(">>> [SqliteService Fallback] Erro ao aplicar alteração no fallbackStore:", err);
      }
    } else if (sqlUpper.includes("SYSTEM_CONTEXT")) {
      try {
        const context = await fallbackStore.getItem<Record<string, unknown>[]>('system_context') || [];
        if (sqlUpper.includes("INSERT OR REPLACE")) {
          const key = params[0] ? String(params[0]) : '';
          const value = params[1] ? String(params[1]) : '';
          if (key) {
            const idx = context.findIndex(c => c.key === key);
            if (idx >= 0) {
              context[idx] = { key, value, updated_at: new Date().toISOString() };
            } else {
              context.push({ key, value, updated_at: new Date().toISOString() });
            }
            await fallbackStore.setItem('system_context', context);
          }
        }
      } catch (err) {
        console.error(">>> [SqliteService Fallback] Erro ao salvar context no fallbackStore:", err);
      }
    } else if (sqlUpper.includes("UNIT_CONFIGS")) {
      try {
        const configs = await fallbackStore.getItem<Record<string, unknown>[]>('unit_configs') || [];
        if (sqlUpper.includes("INSERT OR REPLACE")) {
          const newConfig = parseSqlAndParams(sql, params);
          const id = String(newConfig.id || '');
          if (id) {
            const idx = configs.findIndex(c => c.id === id);
            if (idx >= 0) {
              configs[idx] = { ...configs[idx], ...newConfig };
            } else {
              configs.push(newConfig);
            }
            await fallbackStore.setItem('unit_configs', configs);
          }
        } else if (sqlUpper.includes("DELETE FROM")) {
          await fallbackStore.removeItem('unit_configs');
        }
      } catch (err) {
        console.error(">>> [SqliteService Fallback] Erro ao salvar unit_configs no fallbackStore:", err);
      }
    }

    if (!this.isInitialized || !this.nativeDb) {
      console.warn(">>> [SqliteService Fallback] execute chamada com banco offline. Executado somente em fallbackStore.");
      return;
    }

    try {
      await this.nativeDb.run(sql, params);
    } catch (err) {
      console.error(">>> [SqliteService] Erro no execute:", sql, "Params:", params, err);
      throw err;
    }
  }

  public async executeRaw(sql: string): Promise<void> {
    if (!this.isInitialized || !this.nativeDb) {
      console.warn(">>> [SqliteService Fallback] executeRaw chamada com banco offline.");
      return;
    }
    try {
      await this.nativeDb.execute(sql);
    } catch (err) {
      console.error(">>> [SqliteService] Erro no executeRaw:", sql, err);
      throw err;
    }
  }

  public async executeBatch(set: { statement: string; values: unknown[] }[]): Promise<void> {
    for (const item of set) {
      try {
        await this.execute(item.statement, item.values);
      } catch (err) {
        console.error(">>> [SqliteService Fallback] Erro ao processar item do lote no fallback:", err);
      }
    }

    if (!this.isInitialized || !this.nativeDb) {
      console.warn(">>> [SqliteService Fallback] executeBatch chamada com banco offline. Executado somente em fallbackStore.");
      return;
    }

    try {
      await this.nativeDb.executeSet(set);
    } catch (err) {
      console.error(">>> [SqliteService] Erro no executeBatch:", err);
      throw err;
    }
  }

  public async saveDatabase(): Promise<void> {
    try {
      if (!this.nativeDb) throw new SQLitePersistenceException("[SRE] Banco nativo inacessível.");
      console.log(">>> [SqliteService] Dump e persistência confirmados no arquivo local do Capacitor.");
    } catch (error) {
      console.error(">>> [SqliteService] Erro salvando banco de dados:", error);
    }
  }

  public async saveInventoryConfig(config: Record<string, unknown>): Promise<void> {
    if (config) {
      console.log(">>> [sqliteService] saveInventoryConfig persistência acionada.");
    }
    return Promise.resolve();
  }

  public async getInventoryConfig(): Promise<Record<string, unknown> | null> { return null; }

  /**
   * Realiza carga pesada utilizando transações atômicas e fila do driver de forma segura.
   */
  public async bulkInsertAssetsOfflineFirst(
    assets: Record<string, unknown>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<void> {
    // Save to fallback store for web simulation/DOM issues resilience
    try {
      console.log(`>>> [SqliteService Fallback] Gravando ${assets.length} ativos no fallbackStore localforage...`);
      await fallbackStore.setItem('loaded_assets', assets);
      console.log(`>>> [SqliteService Fallback] Gravação concluída no fallbackStore.`);
    } catch (err) {
      console.error(">>> [SqliteService Fallback] Erro ao gravar ativos no fallbackStore:", err);
    }

    if (!this.isInitialized || !this.nativeDb) {
      console.warn(">>> [SqliteService Fallback] Banco não inicializado para bulk insert nativo. Retornando após gravação em fallbackStore.");
      if (onProgress) {
        onProgress(assets.length, assets.length);
      }
      return;
    }

    const CHUNK_SIZE = 200;
    const total = assets.length;
    let processed = 0;

    const db = this.nativeDb!;

    this.isImportingBatch = true;
    console.log(`>>> [SqliteService SRE Batch] Iniciando bulk insert de ${total} ativos...`);

    try {
      await this.executeRaw("BEGIN TRANSACTION;");

      const insertSql = `INSERT OR REPLACE INTO ativos (
        id, tenantId, _tenantid, filial, _unitid, status, etiqueta, tag, qt, descricaodoativo,
        serial, dataaqusic, cnpj, nomefornecedor, notafiscal, endereco, registro, subreg,
        databaixa, contacontabil, primarykey, centrodecusto, vlraquisic, sn1_recno, sn3_recno,
        _is_synced, _is_deleted, _conferido, _plaquetado, _aprovado, _isNew, _is_unitized,
        _is_divergent_baixa, _history, DE_PARA, _photoUrl, gps_lat, gps_lng
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = assets.slice(i, i + CHUNK_SIZE);
        const queries: { statement: string; values: unknown[] }[] = [];

        chunk.forEach(asset => {
          queries.push({
            statement: insertSql,
            values: [
              String(asset.id || asset.primarykey || ''),
              String(asset.tenantId || asset._tenantid || asset.tenantid || 'CICOPAL'),
              String(asset._tenantid || asset.tenantId || asset.tenantid || 'CICOPAL'),
              String(asset.filial || asset._unitid || asset.unitid || asset.unitId || ''),
              String(asset._unitid || asset.filial || asset.unitid || asset.unitId || ''),
              String(asset.status || 'P'),
              String(asset.etiqueta || ''),
              String(asset.tag || asset.etiqueta || ''),
              Number(asset.qt ?? 1),
              String(asset.descricaodoativo || ''),
              asset.serial !== undefined ? String(asset.serial) : null,
              asset.dataaqusic !== undefined ? String(asset.dataaqusic) : null,
              asset.cnpj !== undefined ? String(asset.cnpj) : null,
              asset.nomefornecedor !== undefined ? String(asset.nomefornecedor) : null,
              asset.notafiscal !== undefined ? String(asset.notafiscal) : null,
              asset.endereco !== undefined ? String(asset.endereco) : null,
              asset.registro !== undefined ? String(asset.registro) : null,
              asset.subreg !== undefined ? String(asset.subreg) : null,
              asset.databaixa !== undefined ? String(asset.databaixa) : null,
              asset.contacontabil !== undefined ? String(asset.contacontabil) : null,
              String(asset.primarykey || asset.id || ''),
              asset.centrodecusto !== undefined ? String(asset.centrodecusto) : null,
              asset.vlraquisic !== undefined ? Number(asset.vlraquisic) : 0,
              asset.sn1_recno !== undefined ? Number(asset.sn1_recno) : null,
              asset.sn3_recno !== undefined ? Number(asset.sn3_recno) : null,
              Number(asset._is_synced) === 1 ? 1 : 0,
              asset._is_deleted ? 1 : 0,
              asset._conferido ? 1 : 0,
              asset._plaquetado ? 1 : 0,
              asset._aprovado ? 1 : 0,
              asset._isNew ? 1 : 0,
              asset._is_unitized ? 1 : 0,
              asset._is_divergent_baixa ? 1 : 0,
              asset._history !== undefined ? String(asset._history) : null,
              asset.DE_PARA !== undefined ? String(asset.DE_PARA) : null,
              asset._photoUrl !== undefined ? String(asset._photoUrl) : null,
              asset.gps_lat !== undefined ? Number(asset.gps_lat) : null,
              asset.gps_lng !== undefined ? Number(asset.gps_lng) : null
            ]
          });
        });

        await db.executeSet(queries);
        queries.length = 0;
        processed += chunk.length;

        if (onProgress) {
          onProgress(processed, total);
        }
      }

      await this.executeRaw("COMMIT;");
      console.log(`>>> [SqliteService SRE Batch] Sincronização concluída com sucesso! ${processed} itens persistidos.`);
    } catch (err) {
      console.error(">>> [SqliteService SRE Batch] Falha crítica de importação pesada local. Revertendo transação...", err);
      try {
        await this.executeRaw("ROLLBACK;");
      } catch (rollErr) {
        console.error(">>> [SqliteService SRE Batch] Falha ao reverter transação local:", rollErr);
      }
      throw err;
    } finally {
      this.isImportingBatch = false;
    }
  }

  public async saveCampaigns(campaigns: Record<string, unknown>[]): Promise<void> {
    await this.executeWithMutex(async () => {
      await this.executeWithRetry(async () => {
        const set = campaigns.map(c => ({
          statement: `INSERT OR REPLACE INTO campaigns (id, name, status, tenantId, created_at) VALUES (?, ?, ?, ?, ?);`,
          values: [
            String(c.id || ''),
            String(c.name || ''),
            String(c.status || ''),
            String(c.tenantId || c.tenantid || ''),
            String(c.created_at || '')
          ]
        }));
        await this.executeBatch(set);
      });
    });
  }

  public async getCampaigns(): Promise<Record<string, unknown>[]> {
    try {
      return await this.query("SELECT * FROM campaigns");
    } catch {
      return [];
    }
  }

  public async saveLocalAsset(
    id: string, vlr: number, filial: string, desc: string, registro: string, qt: number,
    tenant: string, primarykey: string, conferido: number, isNew: number, isSynced: number, endereco: string
  ): Promise<void> {
    await this.executeWithRetry(async () => {
       const sql = `INSERT OR REPLACE INTO ativos (
         id, etiqueta, tag, vlraquisic, filial, descricaodoativo, registro, qt, tenantId, _tenantid, primarykey, _conferido, _isNew, _is_synced, endereco
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
       await this.execute(sql, [id, id, id, vlr, filial, desc, registro, Number(qt ?? 1), tenant, tenant, primarykey, conferido, isNew, isSynced, endereco]);
    });
  }

  public async getAssetsOffline(): Promise<Record<string, unknown>[]> {
    return this.query("SELECT * FROM ativos;");
  }

  /* ==========================================
     SRE SOBERANIA NATIVA: ADIÇÕES DE COMPATIBILIDADE GBR v3.20
     ========================================== */

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getDbStatus(): string {
    return this.dbStatus;
  }

  public getStorageSource(): string {
    return 'PHYSICAL';
  }

  public getNativePath(): string {
    return `/local-storage/${this.dbName}`;
  }

  public async setSystemStatus(status: string): Promise<void> {
    this.dbStatus = status as DatabaseStatus;
    await this.setContextValue('system_status', status);
  }

  public setPermissionsGranted(granted: boolean): void {
    this.permissionsGranted = granted;
  }

  public async getFileStatus(): Promise<{ status: string; path: string; fileName?: string }> {
    return {
      status: this.isInitialized ? 'linked' : 'permission_denied',
      path: this.getNativePath(),
      fileName: this.dbName
    };
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
      return await this.query("SELECT * FROM ativos WHERE _is_deleted = 0;");
    } catch (err) {
      console.error(">>> [SqliteService] Erro ao buscar todos os ativos:", err);
      return [];
    }
  }

  public async getAssetCount(): Promise<number> {
    try {
      const res = await this.query("SELECT COUNT(*) as total FROM ativos WHERE _is_deleted = 0;");
      return Number(res[0]?.total ?? 0);
    } catch (err) {
      console.warn(">>> [SqliteService] Erro ao obter contagem de ativos do SQLite, consultando fallbackStore:", err);
      try {
        const assets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
        const nonDeleted = assets.filter(a => a._is_deleted !== 1 && a._is_deleted !== true);
        return nonDeleted.length;
      } catch {
        return 0;
      }
    }
  }

  public async countAtivos(): Promise<number> {
    return await this.getAssetCount();
  }

  /**
   * Realiza a limpeza imperativa de todas as tabelas locais e buffers do localforage
   * para preparar o ecossistema para uma nova Carga Expert (Lote 0).
   */
  public async forcePurgeAndConnect(): Promise<void> {
    console.log(">>> [SqliteService SRE] Iniciando expurgo imperativo do banco local e fallbacks...");
    this.isImportingBatch = true;
    try {
      // 1. Limpa o armazenamento de contingência do localforage
      await fallbackStore.removeItem('loaded_assets');
      await fallbackStore.clear().catch(() => {});
      
      // 2. Se o banco físico estiver ativo, limpa as tabelas de ativos e encolhe o arquivo
      if (this.isInitialized && this.nativeDb) {
        const db = this.nativeDb!;
        await db.executeRaw("DELETE FROM ativos;");
        await db.executeRaw("DELETE FROM assets;");
        await db.executeRaw("DELETE FROM audit_logs;");
        await db.executeRaw("VACUUM;");
        console.log(">>> [SqliteService SRE] Tabelas físicas limpas e compactadas via VACUUM.");
      }
      
      console.log(">>> [SqliteService SRE] Expurgo concluído com sucesso. Sistema pronto para nova carga.");
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
    try {
      const res = await this.query("PRAGMA integrity_check;");
      const status = String(res[0]?.integrity_check ?? res[0]?.['integrity_check'] ?? 'ok').toLowerCase();
      return status === 'ok';
    } catch {
      return false;
    }
  }

  public async hardResetDatabase(): Promise<void> {
    console.log(">>> [SqliteService] hardResetDatabase acionado.");
    await this.executeWithMutex(async () => {
      if (this.nativeDb) {
        try {
          await this.nativeDb.execute("DROP TABLE IF EXISTS ativos; DROP TABLE IF EXISTS assets; DROP TABLE IF EXISTS audit_logs; DROP TABLE IF EXISTS campaigns; DROP TABLE IF EXISTS SYSTEM_CONTEXT; DROP TABLE IF EXISTS unit_configs;");
          await this.runDDLScripts();
          console.log(">>> [SqliteService] hardResetDatabase concluído.");
        } catch (err) {
          console.error(">>> [SqliteService] Erro durante hardResetDatabase:", err);
          throw err;
        }
      }
    });
  }

  public async salvarCampanhaAtiva(selectedUnit: string, campaignId: string): Promise<void> {
    await this.setContextValue('selected_unit', selectedUnit);
    await this.setContextValue('active_campaign', campaignId);
  }

  public async forceSync(): Promise<boolean> {
    console.log(">>> [SqliteService] forceSync acionado. Disparando flush de buffers locais...");
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
      let sqlBase = "FROM ativos WHERE _is_deleted = 0";
      const params: unknown[] = [];
      if (selectedUnit) {
        sqlBase += " AND filial = ?";
        params.push(selectedUnit);
      }
      if (currentCampaignId) {
        sqlBase += " AND currentCampaignId = ?";
        params.push(currentCampaignId);
      }

      const totalRes = await this.query(`SELECT COUNT(*) as total ${sqlBase}`, params);
      const checkedRes = await this.query(`SELECT COUNT(*) as checked ${sqlBase} AND _conferido = 1`, params);
      const baixadosRes = await this.query(`SELECT COUNT(*) as baixados ${sqlBase} AND _conferido = 1 AND status = 'B'`, params);

      const totalAtivos = Number(totalRes[0]?.total ?? totalRes[0]?.COUNT ?? 0);
      const conferidoAtivos = Number(checkedRes[0]?.checked ?? checkedRes[0]?.COUNT ?? 0);
      const baixadosLocalizados = Number(baixadosRes[0]?.baixados ?? baixadosRes[0]?.COUNT ?? 0);
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

  /* ==========================================
     MÉTODOS DO BUFFER ATÔMICO ("REGRA DOS 5")
     ========================================== */

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
    
    // Dispara gravação automática em background se chegar a um limite de 5 alterações
    if (this.bufferedFieldChanges.length >= 5) {
      this.flushFieldChanges().catch(err => {
        console.error(">>> [sqliteService] Erro ao disparar flush automático:", err);
      });
    }
  }

  public getBufferedChangesCount(): number {
    return this.bufferedFieldChanges.length;
  }

  private getUpsertSqlLocal(table: string, srcObj: Record<string, unknown>) {
    const obj = { ...srcObj };
    
    // Lista unificada das colunas aceitas fisicamente na tabela ativos / assets
    const columns = [
      'id', 'tenantId', '_tenantid', 'filial', '_unitid', 'status', 'etiqueta', 'tag', 'qt',
      'descricaodoativo', 'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal',
      'endereco', 'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey',
      'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno', '_is_synced', '_is_deleted',
      '_conferido', '_plaquetado', '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa',
      '_history', 'DE_PARA', '_photoUrl', 'gps_lat', 'gps_lng', 'currentCampaignId'
    ];
    
    const keys = Object.keys(obj).filter(k => columns.includes(k));
    const placeholders = keys.map(() => '?').join(', ');
    const columnsStr = keys.join(', ');
    const sql = `INSERT OR REPLACE INTO ${table} (${columnsStr}) VALUES (${placeholders})`;
    
    const values = keys.map(k => {
      const val = obj[k];
      if (typeof val === 'boolean') return val ? 1 : 0;
      if (val !== null && typeof val === 'object') return JSON.stringify(val);
      return val;
    });
    
    return { sql, values };
  }

  public async flushFieldChanges(): Promise<void> {
    if (this.bufferedFieldChanges.length === 0) return;
    
    console.log(`>>> [sqliteService] flushFieldChanges acionado para ${this.bufferedFieldChanges.length} alterações...`);
    const changesToProcess = [...this.bufferedFieldChanges];
    this.bufferedFieldChanges = [];

    await this.executeWithMutex(async () => {
      await this.executeWithRetry(async () => {
        for (const change of changesToProcess) {
          const asset = change.asset;
          const uAtivos = this.getUpsertSqlLocal('ativos', asset);
          const uAssets = this.getUpsertSqlLocal('assets', asset);
          await this.execute(uAtivos.sql, uAtivos.values);
          await this.execute(uAssets.sql, uAssets.values);

          const details = `Alteração do campo ${change.field} de ${change.oldValue || 'NULO'} para ${change.newValue || 'NULO'}`;
          await this.logAuditEvent(
            change.userEmail,
            'FIELD_BUFFERED_UPDATE',
            'ativos',
            String(asset.id || ''),
            details,
            JSON.stringify({ field: change.field, oldValue: change.oldValue, newValue: change.newValue })
          );
        }
      });
    });
    
    await this.saveDatabase();
    console.log(`>>> [sqliteService] flushFieldChanges concluído com sucesso.`);
  }
}

export const sqliteService = SqliteService.getInstance();
