// src/services/sqliteService.ts
import { Capacitor } from '@capacitor/core';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';

export enum DatabaseStatus {
  EMPTY = 'EMPTY',
  LOADED = 'LOADED',
  CRITICAL_ERROR = 'CRITICAL_ERROR',
  ACTIVE = 'ACTIVE'
}

const DB_ASSET_COLUMNS: string[] = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 
  'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 
  'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey', 
  'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno', '_is_synced', '_is_deleted'
];

class SqliteService {
  private isInitialized: boolean = false;
  private isInitializingDb: boolean = false;
  private nativeDb: SQLiteDBConnection | null = null;
  private sqliteConnection: SQLiteConnection | null = null;
  public currentDbStatus: DatabaseStatus = DatabaseStatus.EMPTY;
  private storageKeys = { nativeFileName: 'gbr_kardek.db' };
  public isImportingBatch: boolean = false;
  private permissionsGranted: boolean = true;
  public ts: number = Date.now();

  /**
   * Inicialização Física e Acoplamento de Hardware (Capacitor + Jeep-SQLite WASM)
   */
  async init(force = false): Promise<void> {
    if (this.isInitialized && this.nativeDb && !force) {
      console.log(">>> [SRE AUDIT] Conexão ativa preservada. Abortando reinicialização.");
      return;
    }

    if (this.isInitializingDb) {
      console.warn(">>> [SRE WARNING] Bloqueio de concorrência ativado. Aguardando liberação do barramento...");
      return new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const check = setInterval(() => {
          attempts++;
          if (!this.isInitializingDb) {
            clearInterval(check);
            if (this.isInitialized && this.nativeDb) {
              resolve();
            } else {
              reject(new Error("[SRE] Falha paralela na inicialização do banco."));
            }
          }
          if (attempts > 100) {
            clearInterval(check);
            reject(new Error("[SRE TIMEOUT] Estouro de tempo limite na fila de concorrência do boot."));
          }
        }, 100);
      });
    }

    this.isInitializingDb = true;

    try {
      console.log(">>> [SRE AUDIT] Iniciando Bootstrap do Barramento de Persistência...");

      if (!this.sqliteConnection) {
        this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      }

      const isNative = Capacitor.isNativePlatform();
      const dbName = this.storageKeys.nativeFileName;

      if (!isNative) {
        console.log(">>> [SRE Web] Injetando container jeep-sqlite para IndexedDB...");
        const loader = await import('jeep-sqlite/loader');
        if (loader && loader.defineCustomElements) {
          await loader.defineCustomElements(window);
        }
        if (!document.querySelector('jeep-sqlite')) {
          const jeepEl = document.createElement('jeep-sqlite');
          document.body.appendChild(jeepEl);
        }
        await this.sqliteConnection.initWebStore();
      } else {
        console.log(">>> [SRE Device] Barramento Mobile Nativo detectado.");
        await this.sqliteConnection.checkConnectionsConsistency();
      }

      if (force) {
        try {
          const isConnBefore = await this.sqliteConnection.isConnection(dbName, false);
          if (isConnBefore.result) {
            const prevConn = await this.sqliteConnection.retrieveConnection(dbName, false);
            if ((await prevConn.isDBOpen()).result) {
              await prevConn.close();
            }
            await this.sqliteConnection.closeConnection(dbName, false);
          }
        } catch (cleanConnErr) {
          console.warn(">>> [SRE Disk Warn] Ignorada falha na limpeza de conexões:", cleanConnErr);
        }
      }

      const isConn = await this.sqliteConnection.isConnection(dbName, false);
      if (isConn.result) {
        this.nativeDb = await this.sqliteConnection.retrieveConnection(dbName, false);
      } else {
        this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
      }

      if (!(await this.nativeDb.isDBOpen()).result) {
        await this.nativeDb.open();
        console.log(">>> [SRE SUCCESS] Arquivo gbr_kardek.db montado com sucesso.");
      }

      await this.applySchemaDDL();

      if (!isNative) {
        await this.sqliteConnection.saveToStore(dbName);
      }

      this.isInitialized = true;
      this.currentDbStatus = DatabaseStatus.LOADED;
      console.log(">>> [SRE SUCESSO] Barramento estável. Inicialização concluída.");

    } catch (error) {
      this.currentDbStatus = DatabaseStatus.CRITICAL_ERROR;
      this.isInitialized = false;
      this.nativeDb = null;
      console.error(">>> [SRE CRITICAL FAIL] Colapso na conexão física do SQLite:", error);
      throw error;
    } finally {
      this.isInitializingDb = false;
    }
  }

  async forcePurgeAndConnect(): Promise<void> {
    if (!this.sqliteConnection) return;
    const dbName = this.storageKeys.nativeFileName;
    try {
      console.log(">>> [SRE PURGE] Iniciando fechamento violento e purga de conexões zumbis no SQLite...");
      await this.sqliteConnection.closeConnection(dbName, false);
    } catch (e) {
      console.warn(">>> [SRE PURGE] Falha ao fechar conexão existente (pode já estar fechada):", e);
    }
    
    try {
      this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
      await this.nativeDb.open();
      this.isInitialized = true;
      console.log(">>> [SRE PURGE] Nova conexão bloqueada estabelecida com sucesso.");
    } catch (err) {
      console.error(">>> [SRE PURGE FATAL] Falha absoluta ao recriar conexão trancada:", err);
      throw err;
    }
  }

  async closeCurrentConnection(): Promise<void> {
    if (!this.sqliteConnection) return;
    try {
      await this.sqliteConnection.closeConnection(this.storageKeys.nativeFileName, false);
      this.isInitialized = false;
      this.nativeDb = null;
      console.log(">>> [SRE CLOSED] Conexão com gbr_kardek.db fechada de forma elegante.");
    } catch (err) {
      console.warn(">>> [SRE CLOSE WARN] Falha no fechamento elegante:", err);
    }
  }

  async reopenConnection(): Promise<void> {
    if (!this.sqliteConnection) return;
    try {
      const dbName = this.storageKeys.nativeFileName;
      const isConn = await this.sqliteConnection.isConnection(dbName, false);
      if (isConn.result) {
        this.nativeDb = await this.sqliteConnection.retrieveConnection(dbName, false);
        if (!(await this.nativeDb.isDBOpen()).result) {
          await this.nativeDb.open();
          console.log(">>> [SRE SUCCESS] Arquivo gbr_kardek.db reaberto com sucesso.");
        }
      } else {
        this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
        await this.nativeDb.open();
      }
      this.isInitialized = true;
    } catch (err) {
      console.error(">>> [SRE CRITICAL FAIL] Falha ao reabrir conexão:", err);
      throw err;
    }
  }

  private async applySchemaDDL(): Promise<void> {
    if (!this.nativeDb) throw new Error("[SRE] Instância nativeDb ausente no DDL.");
    
    const SCHEMA_ATOMIC = `
      CREATE TABLE IF NOT EXISTS ativos (
        id TEXT PRIMARY KEY,
        tenantid TEXT,
        _tenantid TEXT,
        filial TEXT,
        _unitid TEXT,
        status TEXT,
        etiqueta TEXT,
        tag TEXT,
        qt INTEGER DEFAULT 1,
        descricaodoativo TEXT,
        serial TEXT,
        dataaqusic TEXT,
        cnpj TEXT,
        nomefornecedor TEXT,
        notafiscal TEXT,
        endereco TEXT,
        registro TEXT,
        subreg TEXT,
        databaixa TEXT,
        contacontabil TEXT,
        primarykey TEXT,
        centrodecusto TEXT,
        vlraquisic REAL,
        sn1_recno INTEGER,
        sn3_recno INTEGER,
        currentCampaignId TEXT,
        _is_synced INTEGER DEFAULT 0,
        _is_deleted INTEGER DEFAULT 0,
        _conferido INTEGER DEFAULT 0,
        _plaquetado INTEGER DEFAULT 1,
        _aprovado INTEGER DEFAULT 0,
        _isNew INTEGER DEFAULT 0,
        _is_unitized INTEGER DEFAULT 0,
        _is_divergent_baixa INTEGER DEFAULT 0,
        _history TEXT,
        DE_PARA TEXT
      );
      
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        tenantid TEXT,
        _tenantid TEXT,
        filial TEXT,
        _unitid TEXT,
        status TEXT,
        etiqueta TEXT,
        tag TEXT,
        qt INTEGER DEFAULT 1,
        descricaodoativo TEXT,
        serial TEXT,
        dataaqusic TEXT,
        cnpj TEXT,
        nomefornecedor TEXT,
        notafiscal TEXT,
        endereco TEXT,
        registro TEXT,
        subreg TEXT,
        databaixa TEXT,
        contacontabil TEXT,
        primarykey TEXT,
        centrodecusto TEXT,
        vlraquisic REAL,
        sn1_recno INTEGER,
        sn3_recno INTEGER,
        currentCampaignId TEXT,
        _is_synced INTEGER DEFAULT 0,
        _is_deleted INTEGER DEFAULT 0,
        _conferido INTEGER DEFAULT 0,
        _plaquetado INTEGER DEFAULT 1,
        _aprovado INTEGER DEFAULT 0,
        _isNew INTEGER DEFAULT 0,
        _is_unitized INTEGER DEFAULT 0,
        _is_divergent_baixa INTEGER DEFAULT 0,
        _history TEXT,
        DE_PARA TEXT
      );

      CREATE TABLE IF NOT EXISTS AUDIT_LOG (
        id TEXT PRIMARY KEY,
        usuario TEXT,
        acao TEXT,
        tabela TEXT,
        registro_id TEXT,
        details TEXT,
        delta TEXT,
        _status_sinc INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        usuario TEXT,
        acao TEXT,
        tabela TEXT,
        registro_id TEXT,
        details TEXT,
        delta TEXT,
        _status_sinc INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT,
        name TEXT,
        email TEXT,
        password TEXT,
        role TEXT,
        is_admin INTEGER DEFAULT 0,
        _tenantid TEXT,
        _unitid TEXT
      );

      CREATE TABLE IF NOT EXISTS unit_configs (
        id TEXT PRIMARY KEY,
        selectedUnit TEXT,
        currentCampaignId TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        tenantId TEXT
      );

      CREATE TABLE IF NOT EXISTS SYSTEM_CONTEXT (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ativos_etiqueta ON ativos(etiqueta);
      CREATE INDEX IF NOT EXISTS idx_ativos_tenant_filial ON ativos(tenantId, filial);
      CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets(etiqueta);
      CREATE INDEX IF NOT EXISTS idx_assets_tenant_filial ON assets(tenantId, filial);
    `;
    try {
      await this.nativeDb.execute(SCHEMA_ATOMIC);
      console.log(">>> [SRE Schema] DDL e índices do ecossistema físico consolidados em disco.");
    } catch (err) {
      console.error(">>> [SRE Schema ERR] Erro ao processar DDL do SQLite:", err);
      throw err;
    }
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getDbStatus(): DatabaseStatus {
    return this.currentDbStatus;
  }

  setSystemStatus(status: DatabaseStatus): void {
    this.currentDbStatus = status;
  }

  setImportingMode(val: boolean): void {
    this.isImportingBatch = val;
    if (typeof window !== 'undefined') {
      (window as Record<string, unknown>).__isImportingBatch = val;
    }
  }

  async forceMemoryFallback(): Promise<void> {
    this.currentDbStatus = DatabaseStatus.LOADED;
    return Promise.resolve();
  }

  setPermissionsGranted(val: boolean): void {
    this.permissionsGranted = val;
  }

  async requestFilePermission(): Promise<boolean> {
    this.permissionsGranted = true;
    return Promise.resolve(true);
  }

  async getFileStatus(): Promise<{ status: string; path: string; fileName?: string }> {
    return {
      status: this.isInitialized ? 'linked' : 'prompt',
      path: this.storageKeys.nativeFileName,
      fileName: this.storageKeys.nativeFileName
    };
  }

  getStorageSource(): 'PHYSICAL' | 'CACHE' | 'MEMORY' {
    return Capacitor.isNativePlatform() ? 'PHYSICAL' : 'CACHE';
  }

  getNativePath(): string {
    return this.storageKeys.nativeFileName;
  }

  getMapping(): Record<string, string> {
    return {};
  }

  async checkIntegrity(): Promise<boolean> {
    try {
      await this.query("SELECT 1 FROM ativos LIMIT 1;");
      return true;
    } catch {
      return false;
    }
  }

  async checkTableSchema(tableName: string): Promise<{ isValid: boolean; columns: string[] }> {
    try {
      const res = await this.query(`PRAGMA table_info(${tableName});`);
      const columns = res.map(row => String(row.name || ''));
      return { isValid: columns.length > 0, columns };
    } catch {
      return { isValid: false, columns: [] };
    }
  }

  async obterContextoAtivo(): Promise<{ selectedUnit: string; currentCampaignId: string }> {
    try {
      const resUnit = await this.query("SELECT value FROM SYSTEM_CONTEXT WHERE key = 'selected_unit'");
      const resCamp = await this.query("SELECT value FROM SYSTEM_CONTEXT WHERE key = 'active_campaign'");
      return {
        selectedUnit: String(resUnit[0]?.value || localStorage.getItem('app_selected_unit') || ''),
        currentCampaignId: String(resCamp[0]?.value || localStorage.getItem('app_current_campaign') || '')
      };
    } catch {
      return {
        selectedUnit: localStorage.getItem('app_selected_unit') || '',
        currentCampaignId: localStorage.getItem('app_current_campaign') || ''
      };
    }
  }

  async salvarCampanhaAtiva(selectedUnit: string, campaignId: string): Promise<void> {
    try {
      await this.execute("INSERT OR REPLACE INTO SYSTEM_CONTEXT (key, value) VALUES ('selected_unit', ?)", [selectedUnit]);
      await this.execute("INSERT OR REPLACE INTO SYSTEM_CONTEXT (key, value) VALUES ('active_campaign', ?)", [campaignId]);
      localStorage.setItem('app_selected_unit', selectedUnit);
      localStorage.setItem('app_current_campaign', campaignId);
      await this.saveDatabase();
    } catch (err) {
      console.error("[SRE] Error saving active campaign:", err);
    }
  }

  async getUnitConfigs(_tenantId: string): Promise<Record<string, unknown>[]> {
    try {
      if (_tenantId) {
        console.log("[SRE] getUnitConfigs requested for", _tenantId);
      }
      return await this.query("SELECT * FROM unit_configs") as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  async saveUnitConfigToSql(config: Record<string, unknown>): Promise<void> {
    try {
      await this.execute("INSERT OR REPLACE INTO unit_configs (id, selectedUnit, currentCampaignId) VALUES (?, ?, ?)", [config.id, config.selectedUnit, config.currentCampaignId]);
      await this.saveDatabase();
    } catch (err) {
      console.error("[SRE] Error saving config:", err);
    }
  }

  async getUnitConfigsFromSql(): Promise<Record<string, unknown>[]> {
    return this.getUnitConfigs('');
  }

  async loadStateCompleto(): Promise<Record<string, unknown>> {
    try {
      const assets = await this.query("SELECT * FROM ativos");
      return { assets };
    } catch {
      return { assets: [] };
    }
  }

  async bufferFieldChange(assetId: string, field: string, value: unknown, userEmail: string): Promise<void> {
    try {
      const sql = `UPDATE ativos SET ${field} = ?, _is_synced = 0 WHERE id = ?`;
      await this.execute(sql, [value, assetId]);
      await this.logAuditEvent(userEmail, 'BUFFER_FIELD_CHANGE', 'ativos', assetId, `Buffer change for ${field}: ${value}`);
      await this.saveDatabase();
    } catch (err) {
      console.error("[SRE] Error buffering change:", err);
    }
  }

  async forceSync(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async getOperationalUnits(): Promise<string[]> {
    try {
      const res = await this.query("SELECT DISTINCT filial FROM ativos WHERE _is_deleted = 0 ORDER BY filial ASC");
      const list = res.map(row => String(row.filial || row.FILIAL || ''));
      return list.filter(item => item && item.trim() !== '');
    } catch {
      return [];
    }
  }

  async getOperationalUnitsWithStats(_tenantId?: string): Promise<Record<string, unknown>[]> {
    try {
      if (_tenantId) {
        console.log("[SRE] getOperationalUnitsWithStats for tenant", _tenantId);
      }
      const sql = `
        SELECT filial, 
               COUNT(*) as total, 
               SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as checked 
        FROM ativos 
        WHERE _is_deleted = 0 AND filial IS NOT NULL AND filial != ''
        GROUP BY filial
        ORDER BY filial ASC
      `;
      const res = await this.query(sql);
      return res.map(row => ({
        filial: row.filial || row.FILIAL || 'GERAL',
        displayName: row.filial || row.FILIAL || 'GERAL',
        total: Number(row.total || 0),
        checked: Number(row.checked || 0)
      }));
    } catch {
      return [];
    }
  }

  async getDashboardStats(selectedUnit?: string, campaignId?: string): Promise<Record<string, unknown>> {
    try {
      let whereClause = "WHERE _is_deleted = 0";
      const params: unknown[] = [];
      if (selectedUnit) {
        whereClause += " AND (filial = ? OR _unitid = ?)";
        params.push(selectedUnit, selectedUnit);
      }
      if (campaignId) {
        whereClause += " AND currentCampaignId = ?";
        params.push(campaignId);
      }

      const totalRes = await this.query(`SELECT COUNT(*) as total FROM ativos ${whereClause}`, params);
      const checkedRes = await this.query(`SELECT COUNT(*) as checked FROM ativos ${whereClause} AND _conferido = 1`, params);
      const pendingRes = await this.query(`SELECT COUNT(*) as pending FROM ativos ${whereClause} AND (_conferido = 0 OR _conferido IS NULL)`, params);
      const discRes = await this.query(`SELECT COUNT(*) as count FROM ativos ${whereClause} AND (_is_divergent_baixa = 1)`, params);

      const total = Number(totalRes[0]?.total || 0);
      const checked = Number(checkedRes[0]?.checked || 0);
      const pending = Number(pendingRes[0]?.pending || 0);
      const discrepancyCount = Number(discRes[0]?.count || 0);

      const logsRes = await this.query("SELECT * FROM AUDIT_LOG ORDER BY updated_at DESC LIMIT 5");

      return {
        totalAssets: total,
        checkedAssets: checked,
        pendingAssets: pending,
        discrepancyCount,
        recentLogs: logsRes
      };
    } catch (err) {
      console.error("[SRE] Error calculating dashboard stats:", err);
      return {
        totalAssets: 0,
        checkedAssets: 0,
        pendingAssets: 0,
        discrepancyCount: 0,
        recentLogs: []
      };
    }
  }

  async getAssetCount(): Promise<number> {
    if (!this.isInitialized || !this.nativeDb) return 0;
    try {
      const res = await this.nativeDb.query("SELECT COUNT(*) as total FROM ativos;");
      const row = res?.values?.[0];
      return row ? (row.total || row.count || 0) : 0;
    } catch (err) {
      console.error("[SRE ERR] Falha na contagem física:", err);
      return 0;
    }
  }

  async countAtivos(): Promise<number> {
    return this.getAssetCount();
  }

  async getAddressesFromAssetsCounting(): Promise<string[]> {
    try {
      const res = await this.query("SELECT DISTINCT endereco FROM ativos WHERE endereco IS NOT NULL AND endereco != ''");
      return res.map(r => String(r.endereco || ''));
    } catch {
      return [];
    }
  }

  async getBufferedChangesCount(): Promise<number> {
    return 0;
  }

  async flushFieldChanges(): Promise<void> {
    return Promise.resolve();
  }

  async logAuditEvent(usuario: string, acao: string, tabela: string, registro_id: string, details: string, delta?: string): Promise<void> {
    try {
      const id = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
      await this.execute(
        `INSERT INTO AUDIT_LOG (id, usuario, acao, tabela, registro_id, details, delta) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [id, usuario, acao, tabela, registro_id, details, delta || null]
      );
    } catch (err) {
      console.error("[SRE] Error recording audit log:", err);
    }
  }

  async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    if (!this.isInitialized || !this.nativeDb) return [];
    try {
      const res = await this.nativeDb.query(sql, params);
      return (res?.values || []) as Record<string, unknown>[];
    } catch (err) {
      console.error(`[SRE query err] for query "${sql}":`, err);
      throw err;
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.isInitialized || !this.nativeDb) return;
    try {
      await this.nativeDb.run(sql, params);
    } catch (err) {
      console.error(`[SRE execute err] for statement "${sql}":`, err);
      throw err;
    }
  }

  async executeRaw(sql: string): Promise<void> {
    if (!this.isInitialized || !this.nativeDb) return;
    try {
      await this.nativeDb.execute(sql);
    } catch (err) {
      console.error(`[SRE executeRaw err]:`, err);
      throw err;
    }
  }

  async executeBatch(commands: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (!this.isInitialized || !this.nativeDb) return;
    try {
      const set = commands.map(c => ({
        statement: c.sql,
        values: c.params || []
      }));
      await this.nativeDb.executeSet(set);
    } catch (err) {
      console.error("[SRE executeBatch err]:", err);
      throw err;
    }
  }

  async getAllAssets(): Promise<Record<string, unknown>[]> {
    return this.query("SELECT * FROM ativos;");
  }

  async getInventoryConfig(): Promise<Record<string, unknown> | null> {
    return null;
  }

  async saveInventoryConfig(_config: Record<string, unknown>): Promise<void> {
    if (_config) {
      console.log("[SRE] saveInventoryConfig called");
    }
    return Promise.resolve();
  }

  async bulkInsertAssetsOfflineFirst(
    assets: Record<string, unknown>[],
    onProgress?: (progress: { processed: number; total: number; percentage: number }) => void
  ): Promise<void> {
    if (!assets || assets.length === 0) return;
    if (!this.isInitialized) await this.init();
    if (!this.nativeDb) throw new Error("[SRE] Banco nativo inacessível.");

    console.log(`[SRE I/O] Processando buffer de gravação para ${assets.length} registros...`);

    try {
      const BATCH_SIZE = 200;
      const total = assets.length;
      let processed = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = assets.slice(i, i + BATCH_SIZE);
        const queries: { statement: string; values: unknown[] }[] = [];

        chunk.forEach(asset => {
          const cols = DB_ASSET_COLUMNS.join(', ');
          const placeholders = DB_ASSET_COLUMNS.map(() => '?').join(', ');
          const values = DB_ASSET_COLUMNS.map(col => {
            let val = asset[col];
            if (col === 'sn1_recno' || col === 'sn3_recno') {
              if (val === undefined || val === null || val === '') {
                val = 0;
              } else {
                const num = Number(val);
                val = isNaN(num) ? 0 : num;
              }
            }
            if (typeof val === 'boolean') return val ? 1 : 0;
            return val !== undefined ? val : null;
          });

          queries.push({
            statement: `INSERT OR REPLACE INTO ativos (${cols}) VALUES (${placeholders});`,
            values: values
          });
        });

        await this.nativeDb.executeSet(queries);
        processed += chunk.length;

        if (onProgress) {
          const percentage = Math.round((processed / total) * 100);
          onProgress({ processed, total, percentage });
        }

        await new Promise(resolve => setTimeout(resolve, 0));
      }

      await this.saveDatabase();
      console.log(`[SRE SUCCESS] Carga física concluída: ${processed}/${total} ativos sincronizados em disco.`);

    } catch (error) {
      console.error("[SRE CRITICAL FAIL] O laço de gravação física quebrou o buffer do driver:", error);
      throw error;
    }
  }

  async bulkInsertAssets(assets: Record<string, unknown>[]): Promise<void> {
    return this.bulkInsertAssetsOfflineFirst(assets);
  }

  async deleteCampaignSql(campaignId: string): Promise<void> {
    try {
      await this.execute("DELETE FROM ativos WHERE currentCampaignId = ?", [campaignId]);
      await this.execute("DELETE FROM assets WHERE currentCampaignId = ?", [campaignId]);
      await this.saveDatabase();
    } catch (err) {
      console.error("[SRE] Error deleting campaign SQL:", err);
    }
  }

  async getCampaigns(): Promise<Record<string, unknown>[]> {
    try {
      return await this.query("SELECT * FROM campaigns");
    } catch {
      return [];
    }
  }

  async saveCampaign(campaign: Record<string, unknown>): Promise<void> {
    try {
      await this.execute("INSERT OR REPLACE INTO campaigns (id, name, description, tenantId) VALUES (?, ?, ?, ?)", [campaign.id, campaign.name, campaign.description || '', campaign.tenantId || '']);
      await this.saveDatabase();
    } catch (err) {
      console.error("[SRE] Error saving campaign to SQLite:", err);
    }
  }

  async persist(): Promise<void> {
    return this.saveDatabase();
  }

  async mapLocalFolder(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async downloadDatabase(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async purgeAllCache(): Promise<void> {
    return Promise.resolve();
  }

  async reset(): Promise<void> {
    this.isInitialized = false;
    this.nativeDb = null;
    return Promise.resolve();
  }

  async inserirAtivoDireto(
    id: string, vlr: number, filial: string, desc: string, registro: string, qt: string | number,
    tenant: string, primarykey: string, conferido: number, isNew: number, isSynced: number, endereco: string
  ): Promise<void> {
    try {
      const sql = `INSERT OR REPLACE INTO ativos (
        id, etiqueta, tag, vlraquisic, filial, descricaodoativo, registro, qt, tenantid, _tenantid, primarykey, _conferido, _isNew, _is_synced, endereco
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
      await this.execute(sql, [id, id, id, vlr, filial, desc, registro, Number(qt || 1), tenant, tenant, primarykey, conferido, isNew, isSynced, endereco]);
    } catch (err) {
      console.error("[SRE] Error executing inserirAtivoDireto:", err);
      throw err;
    }
  }

  async hardResetDatabase(): Promise<void> {
    try {
      await this.executeRaw("DROP TABLE IF EXISTS ativos; DROP TABLE IF EXISTS assets; DROP TABLE IF EXISTS AUDIT_LOG; DROP TABLE IF EXISTS audit_logs; DROP TABLE IF EXISTS SYSTEM_CONTEXT; DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS campaigns; DROP TABLE IF EXISTS unit_configs;");
      await this.applySchemaDDL();
      await this.saveDatabase();
      console.log(">>> [SRE DATABASE RESET] Database fully purged and structures recreated in disco.");
    } catch (err) {
      console.error("[SRE] Error reseting database:", err);
    }
  }

  async isBatteryCritical(): Promise<boolean> {
    try {
      const isNative = Capacitor.isNativePlatform();
      let level = 1.0;
      let isCharging = true;

      if (isNative) {
        const { Device } = await import('@capacitor/device');
        const info = await Device.getBatteryInfo();
        level = info.batteryLevel !== undefined ? info.batteryLevel : 1.0;
        isCharging = info.isCharging !== undefined ? info.isCharging : true;
      } else {
        const nav = typeof navigator !== 'undefined' ? (navigator as unknown as { getBattery?: () => Promise<{ level?: number; charging?: boolean }> }) : null;
        if (nav && typeof nav.getBattery === 'function') {
          const battery = await nav.getBattery();
          level = battery.level ?? 1.0;
          isCharging = battery.charging ?? true;
        }
      }

      return (level < 0.05 && !isCharging);
    } catch (err) {
      console.warn(">>> [SRE Battery Check] Erro ao ler bateria de segurança:", err);
      return false; // Failsafe para ambientes de teste sem API de bateria
    }
  }

  /**
   * Saneamento e fechamento físico estrito de buffers no armazenamento
   */
  async saveDatabase(): Promise<void> {
    const critical = await this.isBatteryCritical();
    if (critical) {
      console.error(">>> [SRE SAFETY BLOCK] BATERIA CRÍTICA (<5%) SEM CARREGADOR. Bloqueando gravação em disco para mitigar risco de corrupção do arquivo gbr_kardek.db.");
      throw new Error("Transação física bloqueada: nível de bateria crítico (< 5%) sem fonte externa.");
    }

    try {
      if (Capacitor.isNativePlatform()) {
        console.log("[SRE Disk] Estado atômico consolidado no armazenamento móvel nativo.");
      } else {
        if (this.sqliteConnection) {
          await this.sqliteConnection.saveToStore(this.storageKeys.nativeFileName);
          console.log("[SRE WebStore] Estado físico despejado no IndexedDB do navegador.");
        }
      }
    } catch (err) {
      console.error(">>> [SRE FATAL] FALHA DE GRAVAÇÃO NO HARDWARE LOCAL:", err);
      throw new Error("Falha ao consolidar transações no disco rígido.");
    }
  }
}

export const sqliteService = new SqliteService();
