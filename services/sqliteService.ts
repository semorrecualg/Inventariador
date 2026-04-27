import initSqlJs, { Database } from 'sql.js';
import localforage from 'localforage';
import { DatabaseStatus, Asset, InventoryCampaign } from '../types';
import { SCHEMA_PRIORITY, findBestColumn } from '../utils/schema';

const FULL_SCHEMA = `
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    ETIQUETA TEXT,
    DESCRICAODOBEM TEXT,
    GRUPO_EMPRESARIAL TEXT,
    UNIDADE_OPERACIONAL TEXT,
    CC_CUSTO TEXT,
    CONTA_CONTABIL TEXT,
    STATUS TEXT,
    AUDITOR_NOME TEXT,
    AUDITOR_STATUS_CONFERENCIA TEXT,
    DATA_HORA_CONFERENCIA TEXT,
    LATITUDE TEXT,
    LONGITUDE TEXT,
    OBSERVACAO TEXT,
    TAG_INVENTARIO TEXT,
    _photoUrl TEXT,
    _is_unitized INTEGER DEFAULT 0,
    _parent_id TEXT,
    _localMaster TEXT,
    _unitid TEXT,
    _unidade TEXT,
    _tenantid TEXT,
    _is_deleted INTEGER DEFAULT 0,
    _lastUpdated TEXT,
    _conferido INTEGER DEFAULT 0,
    _is_synced INTEGER DEFAULT 0,
    DATAAQUISIC TEXT,
    VLRAQUISIC REAL,
    NOTAFISCAL TEXT,
    NOMEFORNECEDOR TEXT,
    CNPJ TEXT,
    SERIAL TEXT,
    ENDERECO TEXT,
    REGISTRO TEXT,
    SUBREG TEXT,
    DATABAIXA TEXT,
    PRIMARYKEY TEXT,
    Sn1_recno INTEGER,
    Sn3_recno INTEGER
);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets (ETIQUETA);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (STATUS);
CREATE INDEX IF NOT EXISTS idx_assets_endereco ON assets (ENDERECO);
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    _tenantid TEXT,
    _unitid TEXT
);
CREATE TABLE IF NOT EXISTS inventory_config (
    id TEXT PRIMARY KEY,
    _tenantid TEXT,
    data TEXT
);
`;

export type StorageSource = 'PHYSICAL' | 'CACHE' | 'MEMORY' | 'NONE';

class SqliteService {
  private db: Database | null = null;
  private isInitialized = false;
  private storageSource: StorageSource = 'NONE';
  private currentDbStatus: DatabaseStatus = DatabaseStatus.EMPTY;
  private activeFileHandle: FileSystemFileHandle | null = null;
  private permissionGrantedSession = false;
  
  // Soberania de Schema
  private activeSchemaMappings: Record<string, string> = {};
  
  private storageKeys = {
    dbKey: 'sqlite_db_binary',
    fileHandleKey: 'sqlite_file_handle',
    statusKey: 'sqlite_db_status',
    schemaMappingsKey: 'sqlite_schema_mappings'
  };

  // --- Singleton Management ---
  async reset() {
    console.log(">>> [DBA] Resetando Instância do Singleton...");
    if (this.db) {
      try { this.db.close(); } catch (e) { console.warn("Erro ao fechar DB:", e); }
      this.db = null;
    }
    this.isInitialized = false;
    this.storageSource = 'NONE';
    this.permissionGrantedSession = false;
    this.activeSchemaMappings = {};
  }

  async purgeAllCache() {
    console.log(">>> [DBA] Purge de Cache solicitado...");
    await this.reset();
    sessionStorage.clear();
    const keysToPurge = Object.values(this.storageKeys);
    for (const key of keysToPurge) {
      await localforage.removeItem(key);
    }
    // Limpar cache do auditor também
    await localforage.removeItem('inventory_auditor_data');
    console.log(">>> [DBA] Cache limpo com sucesso.");
  }

  async hardResetDatabase() {
    await this.purgeAllCache();
    this.currentDbStatus = DatabaseStatus.EMPTY;
  }

  getIsInitialized() { return this.isInitialized; }
  getStorageSource() { return this.storageSource; }
  async getDb() { return this.db; }

  getDbStatus() { 
    return this.currentDbStatus;
  }

  async setSystemStatus(status: DatabaseStatus) {
    this.currentDbStatus = status;
    await localforage.setItem(this.storageKeys.statusKey, status);
  }

  async getSystemStatus(): Promise<DatabaseStatus> {
    const status = await localforage.getItem<DatabaseStatus>(this.storageKeys.statusKey);
    return status || DatabaseStatus.EMPTY;
  }

  // --- Schema Discovery ---
  async detectAndPersistSchema() {
    if (!this.db) return;
    console.log(">>> [DBA] Detectando soberania de schema...");
    
    const info = await this.checkTableSchema('assets');
    if (!info || info.length === 0) return;
    
    const existingCols = info.map((v: any) => v.name);
    const newMappings: Record<string, string> = {};
    
    // Mapeamento prioritário para Unidade
    const unitCol = findBestColumn(existingCols, SCHEMA_PRIORITY.UNIT);
    if (unitCol) newMappings['UNIT'] = unitCol;
    
    // Mapeamento para Descrição
    const descCol = findBestColumn(existingCols, SCHEMA_PRIORITY.DESCRIPTION);
    if (descCol) newMappings['DESCRIPTION'] = descCol;

    // Mapeamento para Centro de Custo
    const ccCol = findBestColumn(existingCols, SCHEMA_PRIORITY.COST_CENTER);
    if (ccCol) newMappings['COST_CENTER'] = ccCol;
    
    this.activeSchemaMappings = newMappings;
    await localforage.setItem(this.storageKeys.schemaMappingsKey, newMappings);
    console.log(">>> [DBA] Mapeamento de Schema consolidado:", newMappings);
  }

  async getMapping(type: 'UNIT' | 'DESCRIPTION' | 'COST_CENTER'): Promise<string | null> {
    if (Object.keys(this.activeSchemaMappings).length === 0) {
        const saved = await localforage.getItem<Record<string, string>>(this.storageKeys.schemaMappingsKey);
        if (saved) this.activeSchemaMappings = saved;
    }
    return this.activeSchemaMappings[type] || null;
  }

  // --- Permission & Link Flow ---
  async getFileStatus() {
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
      if (!handle) return { status: 'none', fileName: null, path: '' };

      if (this.permissionGrantedSession && this.activeFileHandle) {
        return { 
          status: 'granted', 
          fileName: this.activeFileHandle.name,
          path: this.activeFileHandle.name, 
          handle: this.activeFileHandle 
        };
      }

      // @ts-expect-error mode property is part of the experimental API
      const currentPerm = await handle.queryPermission({ mode: 'readwrite' });
      if (currentPerm === 'granted') this.permissionGrantedSession = true;

      return { 
        status: currentPerm as string, 
        fileName: handle.name,
        path: handle.name, 
        handle 
      };
    } catch (e) {
      console.error(">>> [DBA] Erro ao checar status do arquivo:", e);
      return { status: 'error', fileName: null, path: '' };
    }
  }

  async requestFilePermission() {
    const status = await this.getFileStatus();
    if (status.handle) {
      console.log(">>> [DBA] Solicitando permissão de escrita/leitura ao usuário...");
      // @ts-expect-error requestPermission is part of the experimental API
      const result = await status.handle.requestPermission({ mode: 'readwrite' });
      if (result === 'granted') {
        this.permissionGrantedSession = true;
        await this.init(true); // Força re-init para ler os dados do arquivo físico
        return true;
      }
    }
    return false;
  }

  /**
   * Verifica permissões de forma robusta antes de operações críticas.
   */
  async verifyPermission(handle?: FileSystemFileHandle): Promise<boolean> {
    const targetHandle = handle || this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
    if (!targetHandle) return true; // Se não tem handle, assume modo cache/memória

    try {
      const options = { mode: 'readwrite' };
      // @ts-expect-error mode property is experimental
      if ((await targetHandle.queryPermission(options)) === 'granted') {
        this.permissionGrantedSession = true;
        return true;
      }
      // @ts-expect-error mode property is experimental
      if ((await targetHandle.requestPermission(options)) === 'granted') {
        this.permissionGrantedSession = true;
        return true;
      }
      return false;
    } catch (e) {
      console.error(">>> [DBA] Erro ao verificar permissão:", e);
      return false;
    }
  }

  async createPhysicalFile() {
    console.log(">>> [DBA] Criando Novo Arquivo de Banco de Dados...");
    try {
      // @ts-expect-error showSaveFilePicker is part of the experimental API
      const handle = await window.showSaveFilePicker({
        suggestedName: `inventario_${new Date().toISOString().split('T')[0]}.db`,
        types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db'] } }]
      });

      if (handle) {
        // Inicializa com um buffer vazio de SQLite para garantir validade
        const SQL = await initSqlJs({ 
          locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
        });
        const emptyDb = new SQL.Database();
        const binary = emptyDb.export();
        
        const writable = await handle.createWritable();
        await writable.write(binary);
        await writable.close();
        
        await localforage.setItem(this.storageKeys.fileHandleKey, handle);
        this.activeFileHandle = handle;
        this.permissionGrantedSession = true;
        this.storageSource = 'PHYSICAL';
        
        console.log(">>> [DBA] Novo arquivo criado e vinculado:", handle.name);
        return handle;
      }
    } catch (e) {
      console.warn(">>> [DBA] Falha ao criar arquivo físico:", e);
    }
    return null;
  }

  async linkFile() {
    console.log(">>> [DBA] Iniciando Processo de Vínculo Físico...");
    try {
      // @ts-expect-error showOpenFilePicker is part of the experimental API
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db'] } }],
        excludeAcceptAllOption: true,
        multiple: false
      });

      if (handle) {
        await localforage.setItem(this.storageKeys.fileHandleKey, handle);
        this.activeFileHandle = handle;
        this.permissionGrantedSession = true;
        this.storageSource = 'PHYSICAL';
        console.log(">>> [DBA] Arquivo vinculado com sucesso:", handle.name);
        return handle;
      }
    } catch (e) {
      console.warn(">>> [DBA] Usuário cancelou ou falha no picker:", e);
    }
    return null;
  }

  async hardLinkPick() {
    return await this.linkFile();
  }

  async mapLocalFolder() {
    return await this.linkFile();
  }

  async forceSync() {
    await this.persist(true);
    return true;
  }

  async downloadDatabase() {
    const binary = await this.exportDatabase();
    if (!binary) return;
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Migration & Schema Helpers ---
  private ensureRequiredColumns() {
    if (!this.db) return;
    const tableInfo = this.db.exec("PRAGMA table_info(assets)");
    if (tableInfo.length > 0) {
      const existingCols = tableInfo[0].values.map(v => v[1] as string);
      const requiredCols = [
        { name: 'DATAAQUISIC', type: 'TEXT' },
        { name: 'VLRAQUISIC', type: 'REAL' },
        { name: 'NOTAFISCAL', type: 'TEXT' },
        { name: 'NOMEFORNECEDOR', type: 'TEXT' },
        { name: 'CNPJ', type: 'TEXT' },
        { name: 'SERIAL', type: 'TEXT' },
        { name: 'ENDERECO', type: 'TEXT' },
        { name: 'REGISTRO', type: 'TEXT' },
        { name: 'SUBREG', type: 'TEXT' },
        { name: 'DATABAIXA', type: 'TEXT' },
        { name: 'PRIMARYKEY', type: 'TEXT' },
        { name: 'Sn1_recno', type: 'INTEGER' },
        { name: 'Sn3_recno', type: 'INTEGER' },
        { name: '_is_synced', type: 'INTEGER' }
      ];
      
      for (const col of requiredCols) {
        if (!existingCols.includes(col.name)) {
          console.log(`>>> [DBA] Migração: Adicionando coluna ${col.name}`);
          try {
            this.db.run(`ALTER TABLE assets ADD COLUMN ${col.name} ${col.type}`);
          } catch (e) {
            console.warn(`Falha ao adicionar coluna ${col.name}:`, e);
          }
        }
      }
    }
  }

  // --- Initialization Flow ---
  async init(force = false) {
    if (this.isInitialized && this.db && !force) {
      return true;
    }
    
    if (force) {
      this.isInitialized = false;
      if (this.db) {
        try { this.db.close(); } catch(e) { console.warn(e); }
        this.db = null;
      }
    }
    
    try {
      const SQL = await initSqlJs({ 
        locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
      });
      const handle = this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
      this.currentDbStatus = await this.getSystemStatus();

      if (handle) {
        try {
          let permission = this.permissionGrantedSession ? 'granted' : 'none';
          if (permission !== 'granted') {
             // @ts-expect-error queryPermission is part of the experimental API
             permission = await handle.queryPermission({ mode: 'readwrite' });
          }
          
          if (permission === 'granted') {
            this.permissionGrantedSession = true;
            const file = await handle.getFile();
            const buffer = await file.arrayBuffer();
            
            this.db = new SQL.Database(new Uint8Array(buffer));
            this.db.run(FULL_SCHEMA);
            this.ensureRequiredColumns();
            await this.detectAndPersistSchema(); // Detecta schema soberano
            
            this.storageSource = 'PHYSICAL';
            this.isInitialized = true;
            this.activeFileHandle = handle;
            return true;
          }
        } catch (err) {
          console.error(">>> [DBA] Erro ao interagir com handle:", err);
        }
      }

      // Fallback para Cache
      const binary = await localforage.getItem<Uint8Array>(this.storageKeys.dbKey);
      if (binary && binary.length > 4096) {
        this.db = new SQL.Database(binary);
        this.db.run(FULL_SCHEMA);
        this.ensureRequiredColumns();
        await this.detectAndPersistSchema();

        this.storageSource = 'CACHE';
        this.isInitialized = true;
        return true;
      }

      this.db = new SQL.Database();
      this.db.run(FULL_SCHEMA);
      this.isInitialized = true;
      this.storageSource = 'MEMORY';
      return true;
    } catch (err) {
      console.error(">>> [DBA] FALHA CRÍTICA NA INICIALIZAÇÃO:", err);
      return false;
    }
  }

  async importDatabase(buffer: Uint8Array) {
    if (!this.db) {
       const SQL = await initSqlJs({ 
         locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
       });
       this.db = new SQL.Database(buffer);
    } else {
       try { this.db.close(); } catch(e) { console.warn(e); }
       const SQL = await initSqlJs({ 
         locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
       });
       this.db = new SQL.Database(buffer);
    }
    this.isInitialized = true;
    await this.detectAndPersistSchema();
    await this.persist();
  }

  async exportDatabase(): Promise<Uint8Array | null> {
    if (!this.db) return null;
    return this.db.export();
  }

  async persist(force = false) {
    if (!this.db) return;
    const shouldSyncPhysical = force || (this.storageSource === 'PHYSICAL' && !!this.activeFileHandle);

    try {
      const binary = this.db.export();
      await localforage.setItem(this.storageKeys.dbKey, binary);
      
      if (shouldSyncPhysical && this.activeFileHandle) {
        try {
          const writable = await this.activeFileHandle.createWritable();
          await writable.write(binary);
          await writable.close();
        } catch (err) {
          console.error(">>> [DBA] Falha na escrita física persistente:", err);
        }
      }
    } catch (err) {
      console.error(">>> [DBA] Falha na persistência:", err);
    }
  }

  // --- Helpers ---
  async execute(sql: string, params: unknown[] = []) {
    if (!this.db) return;
    this.db.run(sql, params as any[]);
    await this.persist();
  }

  async query(sql: string, params: unknown[] = []) {
    if (!this.db) return [];
    const res = this.db.exec(sql, params as any[]);
    if (res.length === 0) return [];
    
    const columns = res[0].columns;
    return res[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  async getOperationalUnits(): Promise<string[]> {
    if (!this.db) return [];
    try {
      // 1. Tenta usar mapeamento de soberania primeiro
      const unitCol = await this.getMapping('UNIT');
      if (unitCol) {
        const sql = `SELECT DISTINCT TRIM(UPPER("${unitCol}")) as unit FROM assets`;
        const res = await this.query(sql);
        const units = res.map(r => String(r.unit || '').trim())
                        .filter(u => u && u !== 'NULL' && u !== 'UNDEFINED' && u !== '0');
        if (units.length > 0) return Array.from(new Set(units)).sort();
      }

      // 2. Fallback: Mapeamento exaustivo se não há soberania ou falhou
      const allUnits = new Set<string>();
      for (const col of SCHEMA_PRIORITY.UNIT) {
        try {
          const res = await this.query(`SELECT DISTINCT TRIM(UPPER("${col}")) as unit FROM assets`);
          res.forEach(r => {
            const val = String(r.unit || '').trim();
            if (val && val !== 'NULL' && val !== 'UNDEFINED' && val !== '0') {
              allUnits.add(val);
            }
          });
        } catch { /* Ignora colunas inexistentes */ }
      }
      return Array.from(allUnits).sort();
    } catch (e) {
      console.error(">>> [DBA] Erro ao buscar unidades:", e);
      return [];
    }
  }

  async checkTableSchema(tableName: string) {
    if (!this.db) return null;
    try {
      const info = await this.query(`PRAGMA table_info(${tableName})`);
      return info;
    } catch (e) {
      console.error(`>>> [DBA] Erro ao checar schema de ${tableName}:`, e);
      return null;
    }
  }

  async getAssetCount(): Promise<number> {
    const res = await this.query("SELECT COUNT(*) as total FROM assets WHERE _is_deleted = 0");
    return Number(res[0]?.total || 0);
  }

  async bulkInsertAssets(assets: Asset[], skipPersist = false) {
    if (!this.db) return;
    this.db.run("BEGIN TRANSACTION");
    try {
      const sqlBulk = `INSERT OR REPLACE INTO assets (
        id, ETIQUETA, DESCRICAODOBEM, GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, 
        CC_CUSTO, CONTA_CONTABIL, STATUS, DATA_HORA_CONFERENCIA, 
        LATITUDE, LONGITUDE, DATAAQUISIC, VLRAQUISIC, NOTAFISCAL, 
        NOMEFORNECEDOR, CNPJ, SERIAL, ENDERECO, REGISTRO, SUBREG,
        DATABAIXA, PRIMARYKEY, Sn1_recno, Sn3_recno,
        _unitid, _tenantid, _photoUrl, TAG_INVENTARIO, _lastUpdated, _conferido, _is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const stmtBulk = this.db.prepare(sqlBulk);
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        stmtBulk.run([
          asset.id || (self.crypto?.randomUUID ? self.crypto.randomUUID() : Math.random().toString(36).substring(2)), 
          asset.ETIQUETA, 
          asset.DESCRICAODOATIVO || asset.DESCRICAODOBEM, 
          asset.GRUPO_EMPRESARIAL, 
          asset.UNIDADE_OPERACIONAL,
          asset.CENTRODECUSTO || asset.CC_CUSTO,
          asset.CONTACONTABIL || asset.CONTA_CONTABIL,
          asset.STATUS,
          asset.DATA_HORA_CONFERENCIA || asset._dataLeitura,
          asset.LATITUDE || asset._lat,
          asset.LONGITUDE || asset._lng,
          asset.DATAAQUISIC,
          asset.VLRAQUISIC,
          asset.NOTAFISCAL,
          asset.NOMEFORNECEDOR,
          asset.CNPJ,
          asset.SERIAL,
          asset.ENDERECO,
          asset.REGISTRO,
          asset.SUBREG,
          asset.DATABAIXA,
          asset.PRIMARYKEY || asset.PK,
          asset.Sn1_recno,
          asset.Sn3_recno,
          asset._unitid, 
          asset._tenantid, 
          asset._photoUrl, 
          asset.TAG_INVENTARIO, 
          asset._lastUpdated || new Date().toISOString(),
          asset._conferido ? 1 : 0,
          asset._is_synced ?? 0
        ]);
      }
      stmtBulk.free();
      this.db.run("COMMIT");
      if (!skipPersist) await this.persist();
    } catch (e) {
      if (this.db) this.db.run("ROLLBACK");
      throw e;
    }
  }

  // --- Outras Consultas ---
  async getCampaigns(tenantId: string): Promise<InventoryCampaign[]> {
    return await this.query("SELECT * FROM campaigns WHERE _tenantid = ?", [tenantId]) as unknown as InventoryCampaign[];
  }

  async saveCampaign(campaign: InventoryCampaign) {
    await this.execute(
      "INSERT OR REPLACE INTO campaigns (id, name, description, status, start_date, end_date, _tenantid, _unitid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [campaign.id, campaign.name, campaign.description, campaign.status, campaign.start_date, campaign.end_date, campaign._tenantid, campaign._unitid]
    );
  }

  async deleteCampaignSql(id: string) {
    await this.execute("DELETE FROM campaigns WHERE id = ?", [id]);
    await this.execute("UPDATE assets SET _campaignId = NULL WHERE _campaignId = ?", [id]);
  }

  async executeBatch(commands: { sql: string, params: any[] }[]) {
    if (!this.db) return;
    this.db.run("BEGIN TRANSACTION");
    try {
      for (const cmd of commands) {
        this.db.run(cmd.sql, (cmd.params || []) as any[]);
      }
      this.db.run("COMMIT");
      await this.persist();
    } catch (e) {
      if (this.db) this.db.run("ROLLBACK");
      throw e;
    }
  }

  async saveInventoryConfig(data: any, tenantId?: string) {
    const tid = tenantId || (data?._tenantid) || 'default';
    await this.execute(
      "INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)",
      ['config_' + tid, tid, JSON.stringify(data)]
    );
  }

  async getInventoryConfig(tenantId?: string | null) {
    let sql = "SELECT data FROM inventory_config";
    let params: any[] = [];
    if (tenantId) {
      sql += " WHERE _tenantid = ?";
      params = [tenantId];
    } else {
      sql += " LIMIT 1";
    }
    const res = await this.query(sql, params);
    if (res.length === 0) return null;
    return JSON.parse(res[0].data as string);
  }

  async getAllAssets(): Promise<Asset[]> {
    return await this.query("SELECT * FROM assets WHERE _is_deleted = 0") as unknown as Asset[];
  }
}

export const sqliteService = new SqliteService();
