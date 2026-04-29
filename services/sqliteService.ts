import initSqlJs, { Database } from 'sql.js';
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
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
    _campaignId TEXT,
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
    tenant_id TEXT,
    unit_id TEXT
);

CREATE TABLE IF NOT EXISTS inventory_config (
    id TEXT PRIMARY KEY,
    _tenantid TEXT,
    data TEXT
);

CREATE TABLE IF NOT EXISTS campaign_snapshots (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    assets_data TEXT,
    metadata TEXT,
    closed_at TEXT,
    closed_by TEXT,
    _tenantid TEXT
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
  private activeSchemaMappings: Record<string, string> = {};
  
  private storageKeys = {
    dbKey: 'sqlite_db_binary',
    fileHandleKey: 'sqlite_file_handle',
    statusKey: 'sqlite_db_status',
    schemaMappingsKey: 'sqlite_schema_mappings',
    nativeFileName: 'auditoria_soberana.db'
  };

  constructor() {
    localforage.config({
      name: 'AuditoriaInteligente',
      storeName: 'sqlite_store',
      driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE]
    });
  }

  async reset() {
    if (this.db) {
      try { this.db.close(); } catch (e) { console.warn(e); }
      this.db = null;
    }
    this.isInitialized = false;
    this.storageSource = 'NONE';
    this.permissionGrantedSession = false;
    this.activeSchemaMappings = {};
  }

  async purgeAllCache() {
    await this.reset();
    sessionStorage.clear();
    await localforage.removeItem(this.storageKeys.dbKey);
    await localforage.removeItem(this.storageKeys.fileHandleKey);
    await localforage.removeItem(this.storageKeys.statusKey);
    await localforage.removeItem(this.storageKeys.schemaMappingsKey);
    await localforage.removeItem('inventory_auditor_data');
  }

  async hardResetDatabase() {
    await this.purgeAllCache();
    this.currentDbStatus = DatabaseStatus.EMPTY;
  }

  getIsInitialized() { return this.isInitialized; }
  getStorageSource() { return this.storageSource; }
  getDbStatus() { return this.currentDbStatus; }

  async setSystemStatus(status: DatabaseStatus) {
    this.currentDbStatus = status;
    await localforage.setItem(this.storageKeys.statusKey, status);
  }

  async getSystemStatus(): Promise<DatabaseStatus> {
    const status = await localforage.getItem<DatabaseStatus>(this.storageKeys.statusKey);
    return status || DatabaseStatus.EMPTY;
  }

  async detectAndPersistSchema() {
    if (!this.db) return;
    try {
      const res = this.db.exec("PRAGMA table_info(assets)");
      if (!res || res.length === 0) return;
      const columns = res[0].values.map(v => v[1] as string);
      
      const newMappings: Record<string, string> = {};
      const unitCol = findBestColumn(columns, SCHEMA_PRIORITY.UNIT);
      if (unitCol) newMappings['UNIT'] = unitCol;
      
      const descCol = findBestColumn(columns, SCHEMA_PRIORITY.DESCRIPTION);
      if (descCol) newMappings['DESCRIPTION'] = descCol;

      const ccCol = findBestColumn(columns, SCHEMA_PRIORITY.COST_CENTER);
      if (ccCol) newMappings['COST_CENTER'] = ccCol;

      this.activeSchemaMappings = newMappings;
      await localforage.setItem(this.storageKeys.schemaMappingsKey, newMappings);
    } catch (e) {
      console.error("Erro ao detectar schema:", e);
    }
  }

  async getMapping(type: 'UNIT' | 'DESCRIPTION' | 'COST_CENTER'): Promise<string | null> {
    if (Object.keys(this.activeSchemaMappings).length === 0) {
      const saved = await localforage.getItem<Record<string, string>>(this.storageKeys.schemaMappingsKey);
      if (saved) this.activeSchemaMappings = saved;
    }
    return this.activeSchemaMappings[type] || null;
  }

  async getFileStatus() {
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
      if (!handle) return { status: 'none', fileName: null, path: '' };
      if (this.permissionGrantedSession && this.activeFileHandle) {
        return { status: 'granted', fileName: this.activeFileHandle.name, path: this.activeFileHandle.name, handle: this.activeFileHandle };
      }
      // @ts-expect-error mode property is experimental
      const currentPerm = await handle.queryPermission({ mode: 'readwrite' });
      if (currentPerm === 'granted') this.permissionGrantedSession = true;
      return { status: currentPerm as string, fileName: handle.name, path: handle.name, handle };
    } catch {
      return { status: 'error', fileName: null, path: '' };
    }
  }

  async requestFilePermission() {
    const status = await this.getFileStatus();
    if (status.handle) {
      // @ts-expect-error requestPermission is experimental
      const result = await status.handle.requestPermission({ mode: 'readwrite' });
      if (result === 'granted') {
        this.permissionGrantedSession = true;
        await this.init(true);
        return true;
      }
    }
    return false;
  }

  async verifyPermission(handle?: FileSystemFileHandle): Promise<boolean> {
    const targetHandle = handle || this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
    if (!targetHandle) return true;
    try {
      // @ts-expect-error queryPermission is experimental
      const status = await targetHandle.queryPermission({ mode: 'readwrite' });
      return status === 'granted';
    } catch { return false; }
  }

  private async ensureRequiredColumns() {
    if (!this.db) return;
    const tables = ['assets', 'campaigns'];
    for (const table of tables) {
      const res = this.db.exec(`PRAGMA table_info(${table})`);
      if (res && res.length > 0) {
        const columns = res[0].values.map(v => v[1] as string);
        if (table === 'campaigns') {
          if (!columns.includes('tenant_id')) this.db.run("ALTER TABLE campaigns ADD COLUMN tenant_id TEXT");
          if (!columns.includes('unit_id')) this.db.run("ALTER TABLE campaigns ADD COLUMN unit_id TEXT");
        }
        if (table === 'assets') {
          if (!columns.includes('_campaignId')) this.db.run("ALTER TABLE assets ADD COLUMN _campaignId TEXT");
          if (!columns.includes('_tenantid')) this.db.run("ALTER TABLE assets ADD COLUMN _tenantid TEXT");
          if (!columns.includes('_unitid')) this.db.run("ALTER TABLE assets ADD COLUMN _unitid TEXT");
        }
      }
    }
  }

  async init(force = false) {
    if (this.isInitialized && this.db && !force) return true;
    if (force) await this.reset();
    
    try {
      const SQL = await initSqlJs({ locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` });
      
      // PRIORIDADE 0: PERSISTÊNCIA NATIVA (CAPACITOR / ANDROID)
      if (Capacitor.isNativePlatform()) {
        try {
          const result = await Filesystem.readFile({
            path: this.storageKeys.nativeFileName,
            directory: Directory.Data
          });
          
          if (result.data) {
            // Capacitor retorna base64
            const binaryString = atob(result.data as string);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            this.db = new SQL.Database(bytes);
            this.db.run(FULL_SCHEMA);
            await this.ensureRequiredColumns();
            this.storageSource = 'PHYSICAL'; // No nativo, o cache é físico
            this.isInitialized = true;
            console.log(">>> [NativeBridge] Banco de Dados NATIVO carregado do disco Android.");
            return true;
          }
        } catch (err) {
          console.warn(">>> [NativeBridge] Arquivo nativo não encontrado ou ilegível. Iniciando novo.", err);
        }
      }

      const handle = this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
      this.currentDbStatus = await this.getSystemStatus();

      if (handle) {
        try {
          // @ts-expect-error queryPermission is experimental
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          if (permission === 'granted') {
            this.permissionGrantedSession = true;
            const file = await handle.getFile();
            const buffer = await file.arrayBuffer();
            this.db = new SQL.Database(new Uint8Array(buffer));
            this.db.run(FULL_SCHEMA);
            await this.ensureRequiredColumns();
            await this.detectAndPersistSchema();
            this.storageSource = 'PHYSICAL';
            this.isInitialized = true;
            this.activeFileHandle = handle;
            return true;
          }
        } catch (err) { console.error(err); }
      }

      const binary = await localforage.getItem<Uint8Array>(this.storageKeys.dbKey);
      if (binary && binary.length > 4096) {
        this.db = new SQL.Database(binary);
        this.db.run(FULL_SCHEMA);
        await this.ensureRequiredColumns();
        await this.detectAndPersistSchema();
        this.storageSource = 'CACHE';
        this.isInitialized = true;
        return true;
      }

      this.db = new SQL.Database();
      this.db.run(FULL_SCHEMA);
      this.storageSource = 'MEMORY';
      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error("Init SQLite failed:", err);
      return false;
    }
  }

  async saveDatabase() {
    if (!this.db || !this.isInitialized) return;
    
    try {
      // Exportação Binária do SQL.js (Snapshot da RAM para ArrayBuffer)
      const data = this.db.export();
      
      if (!data || data.length === 0) {
        throw new Error("Falha na exportação: Binário vazio.");
      }

      // 1. Persistência em CACHE (Nível 1 - IndexedDB/localforage)
      // Garantimos que o salvamento no Cache ocorra SEMPRE
      await localforage.setItem(this.storageKeys.dbKey, data);
      
      // 1.1 Persistência NATIVA (Soberania de Dados)
      if (Capacitor.isNativePlatform()) {
        try {
          // Converter Uint8Array para Base64 para o Capacitor
          let binary = "";
          const bytes = new Uint8Array(data);
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Data = btoa(binary);

          await Filesystem.writeFile({
            path: this.storageKeys.nativeFileName,
            data: base64Data,
            directory: Directory.Data
          });
          console.log(">>> [NativeBridge] SINCRO NATIVA: Sucesso. O dado reside agora no armazenamento interno seguro do Android.");
        } catch (err) {
          console.error(">>> [NativeBridge] FALHA na gravação nativa:", err);
        }
      }

      console.log(`>>> [Persistence] Snapshot SQL salvo no CACHE/NATIVO (${(data.length / 1024 / 1024).toFixed(2)} MB)`);
      
      // Persiste também o status para garantir que o Boot saiba que há dados
      if (this.currentDbStatus === DatabaseStatus.EMPTY) {
        await this.setSystemStatus(DatabaseStatus.LOADED);
      }

      // 2. Persistência FÍSICA (Nível 2 - File System Access API)
      if (this.activeFileHandle && this.permissionGrantedSession) {
        try {
          const status = await this.activeFileHandle.queryPermission({ mode: 'readwrite' });
          if (status === 'granted') {
            const writable = await this.activeFileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            console.log(">>> [Persistence] SINCRO FÍSICA (Android FileHandle): SUCESSO. O dado agora reside fora do Sandbox do navegador.");
            this.storageSource = 'PHYSICAL';
          } else {
            console.warn(">>> [Persistence] SINCRO FÍSICA: Permissão de escrita revogada pelo sistema.");
          }
        } catch (err) { 
          console.error(">>> [Persistence] SINCRO FÍSICA (FATAL): O sistema de arquivos recusou a gravação.", err); 
        }
      }
    } catch (err) {
      console.error(">>> [Persistence] FALHA TOTAL NA GRAVAÇÃO:", err);
    }
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error("Query failed:", sql, err);
      return [];
    }
  }

  async execute(sql: string, params: any[] = []) {
    if (!this.db) await this.init();
    if (!this.db) return;
    try {
      this.db.run(sql, params);
      await this.saveDatabase();
    } catch (err) {
      console.error("Execute failed:", sql, err);
      throw err;
    }
  }

  // --- Ativos ---
  async getAssets(tenantId: string, unitId?: string | null): Promise<Asset[]> {
    let sql = "SELECT * FROM assets WHERE (_tenantid = ? OR GRUPO_EMPRESARIAL = ?) AND _is_deleted = 0";
    const params = [tenantId, tenantId];
    if (unitId) {
      sql += " AND (_unitid = ? OR UNIDADE_OPERACIONAL = ?)";
      params.push(unitId, unitId);
    }
    return await this.query(sql, params) as unknown as Asset[];
  }

  async saveAsset(asset: Asset) {
    const cols = Object.keys(asset).join(', ');
    const placeholders = Object.keys(asset).map(() => '?').join(', ');
    const values = Object.values(asset);
    await this.execute(`INSERT OR REPLACE INTO assets (${cols}) VALUES (${placeholders})`, values);
  }

  async saveAssetsBatch(assets: Asset[]) {
    if (!this.db || assets.length === 0) return;
    try {
      this.db.run("BEGIN TRANSACTION");
      for (const asset of assets) {
        const cols = Object.keys(asset).join(', ');
        const placeholders = Object.keys(asset).map(() => '?').join(', ');
        const values = Object.values(asset);
        this.db.run(`INSERT OR REPLACE INTO assets (${cols}) VALUES (${placeholders})`, values);
      }
      this.db.run("COMMIT");
      await this.saveDatabase();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  async deleteAsset(id: string) {
    await this.execute("UPDATE assets SET _is_deleted = 1 WHERE id = ?", [id]);
  }

  // --- Campanhas ---
  private normalizeCampaign(row: any): InventoryCampaign {
    if (!row) return row;
    return {
      ...row,
      // Normalização de Unidade
      unit_id: (row.unit_id || row._unitid || '').trim(),
      _unitid: (row.unit_id || row._unitid || '').trim(),
      // Normalização de Tenant
      tenant_id: (row.tenant_id || row._tenantid || '').trim(),
      _tenantid: (row.tenant_id || row._tenantid || '').trim(),
      tenantId: (row.tenant_id || row._tenantid || '').trim(),
      // Garantia de Status
      status: row.status || 'CREATED'
    } as InventoryCampaign;
  }

  async getCampaigns(tenantId: string): Promise<InventoryCampaign[]> {
    console.log(`>>> [Governance] SQL Query: SELECT * FROM campaigns WHERE tenant_id = '${tenantId}'`);
    const rows = await this.query("SELECT * FROM campaigns WHERE tenant_id = ? OR _tenantid = ?", [tenantId, tenantId]) as any[];
    const result = (rows || []).map(row => this.normalizeCampaign(row));
    if (result.length > 0) {
      console.table(result.map(c => ({ id: c.id, name: c.name, tenant: c.tenant_id, unit: c.unit_id })));
    } else {
      console.warn(`>>> [Governance] SQL Query retornou 0 resultados para o tenant '${tenantId}'`);
    }
    return result;
  }

  async saveCampaign(campaign: InventoryCampaign): Promise<InventoryCampaign> {
    const payload = {
      id: campaign.id || `local_${Date.now()}`,
      name: campaign.name || 'Sem Nome',
      description: campaign.description || '',
      status: campaign.status || 'CREATED',
      start_date: campaign.start_date || new Date().toISOString(),
      end_date: campaign.end_date || null,
      tenant_id: (campaign.tenant_id || campaign._tenantid || campaign.tenantId || 'CICOPAL').trim(),
      unit_id: (campaign.unit_id || campaign._unitid || '').trim()
    };
    const cols = Object.keys(payload).join(', ');
    const placeholders = Object.keys(payload).map(() => '?').join(', ');
    const values = Object.values(payload).map(v => v === undefined ? null : v);
    
    try {
      await this.execute(`INSERT OR REPLACE INTO campaigns (${cols}) VALUES (${placeholders})`, values);
      await this.saveDatabase();
      const normalized = this.normalizeCampaign(payload);
      console.log(`>>> [Governance] Campanha '${normalized.name}' persistida localmente. ID: ${normalized.id}`);
      return normalized;
    } catch (err) {
      console.error(`>>> [Governance] ERRO CRÍTICO AO SALVAR CAMPANHA:`, err);
      throw err;
    }
  }

  async deleteCampaignSql(id: string) {
    await this.execute("DELETE FROM campaigns WHERE id = ?", [id]);
    await this.execute("UPDATE assets SET _campaignId = NULL WHERE _campaignId = ?", [id]);
    await this.saveDatabase();
  }

  // --- Configurações ---
  async getUnitConfigs(tenantId: string): Promise<any[]> {
    return await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tenantId]);
  }

  async getAssetCount(): Promise<number> {
    const res = await this.query("SELECT COUNT(*) as count FROM assets WHERE _is_deleted = 0");
    return res[0]?.count || 0;
  }

  async getOperationalUnits(): Promise<string[]> {
    const res = await this.query("SELECT DISTINCT UNIDADE_OPERACIONAL FROM assets WHERE UNIDADE_OPERACIONAL IS NOT NULL AND UNIDADE_OPERACIONAL != ''");
    return res.map(row => row.UNIDADE_OPERACIONAL as string);
  }

  async checkTableSchema(tableName: string): Promise<any[]> {
    return await this.query(`PRAGMA table_info(${tableName})`);
  }

  async bulkInsertAssets(assets: Asset[]) {
    return await this.saveAssetsBatch(assets);
  }

  async getAllAssets(): Promise<Asset[]> {
    return await this.query("SELECT * FROM assets WHERE _is_deleted = 0") as unknown as Asset[];
  }

  async saveUnitConfigSql(config: any) {
    const tenantId = config._tenantid || 'CICOPAL';
    await this.execute("INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)", 
      [tenantId, tenantId, JSON.stringify(config)]);
  }

  async getDb() { return this.db; }

  async persist(force = false) {
    if (force) console.log(">>> [Governance] Persistência FORÇADA solicitada.");
    await this.saveDatabase();
  }

  async importDatabase(binary: Uint8Array) {
    const SQL = await initSqlJs({ locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` });
    this.db = new SQL.Database(binary);
    this.isInitialized = true;
    this.storageSource = 'CACHE';
    await this.saveDatabase();
  }

  // --- File Link Methods ---
  async linkFile(handle?: FileSystemFileHandle): Promise<boolean> {
    let targetHandle = handle;
    if (!targetHandle) {
      try {
        // @ts-expect-error showOpenFilePicker is experimental
        const [picked] = await window.showOpenFilePicker({
          types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] } }],
        });
        targetHandle = picked;
      } catch { return false; }
    }
    
    if (!targetHandle) return false;
    
    this.activeFileHandle = targetHandle;
    await localforage.setItem(this.storageKeys.fileHandleKey, targetHandle);
    this.permissionGrantedSession = true;
    await this.init(true);
    return true;
  }

  async hardLinkPick() {
    try {
      // @ts-expect-error showOpenFilePicker is experimental
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] } }],
      });
      if (handle) await this.linkFile(handle);
      return !!handle;
    } catch { return false; }
  }

  async createPhysicalFile(handle?: FileSystemFileHandle) {
    if (handle) {
      await this.linkFile(handle);
      return true;
    }
    try {
      // @ts-expect-error showSaveFilePicker is experimental
      const newHandle = await window.showSaveFilePicker({
        suggestedName: 'inventario.db',
        types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db'] } }],
      });
      if (newHandle) await this.linkFile(newHandle);
      return !!newHandle;
    } catch { return false; }
  }

  async downloadDatabase() {
    if (!this.db) return;
    const binary = this.db.export();
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async executeBatch(queries: {sql: string, params: any[]}[]) {
    if (!this.db) return;
    try {
      this.db.run("BEGIN TRANSACTION");
      for (const q of queries) {
        this.db.run(q.sql, q.params);
      }
      this.db.run("COMMIT");
      await this.saveDatabase();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  async getInventoryConfig(tenantId?: string): Promise<any> {
    const tid = tenantId || localStorage.getItem('app_last_tenant') || 'CICOPAL';
    const res = await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tid]);
    if (res.length > 0 && res[0].data) {
      try {
        return JSON.parse(res[0].data);
      } catch { return null; }
    }
    return null;
  }

  async saveInventoryConfig(config: any) {
    await this.saveUnitConfigSql(config);
  }

  async mapLocalFolder() {
    // Simulação ou placeholder para API experimental de diretórios
    alert("Funcionalidade de mapeamento de pasta disponível apenas em navegadores com suporte a File System Access API.");
  }

  async forceSync(): Promise<boolean> {
    console.log(">>> [Governance] Forçando re-sincronização do motor com o Cache Local...");
    try {
      const success = await this.init(true);
      if (success) {
        console.log(">>> [Governance] Re-sincronização concluída. Estado do banco restaurado.");
        return true;
      }
      return false;
    } catch (err) {
      console.error(">>> [Governance] Falha na re-sincronização:", err);
      return false;
    }
  }

  async downloadDatabase() {
    if (!this.db) return;
    const data = this.db.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_backup_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(">>> [Governance] Backup manual exportado pelo usuário.");
  }
}

export const sqliteService = new SqliteService();
