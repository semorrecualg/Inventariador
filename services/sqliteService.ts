import initSqlJs, { Database } from 'sql.js';
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { DatabaseStatus, Asset, InventoryCampaign } from '../types';
import { SCHEMA_PRIORITY, findBestColumn } from '../utils/schema';
import { DB_ASSET_COLUMNS } from '../constants/schema';

const FULL_SCHEMA = `
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    ETIQUETA TEXT,
    REGISTRO TEXT,
    DESCRICAODOATIVO TEXT,
    VLRAQUISIC REAL,
    DATAAQUISIC TEXT,
    CENTRODECUSTO TEXT,
    CONTACONTABIL TEXT,
    TAG_INVENTARIO TEXT,
    ESTADO_CONSERVACAO TEXT,
    GRUPO_EMPRESARIAL TEXT,
    UNIDADE_OPERACIONAL TEXT,
    UNIDADE TEXT,
    QT TEXT,
    SERIAL TEXT,
    CNPJ TEXT,
    NOMEFORNECEDOR TEXT,
    NOTAFISCAL TEXT,
    ENDERECO TEXT,
    SUBREG TEXT,
    DATABAIXA TEXT,
    PRIMARYKEY TEXT,
    _tenantid TEXT,
    _unitid TEXT,
    _unidade TEXT,
    _conferido INTEGER DEFAULT 0,
    _localMaster TEXT,
    _lastUpdated TEXT,
    _dataLeitura TEXT,
    _auditor TEXT,
    _photoUrl TEXT,
    _lat REAL,
    _lng REAL,
    _campaignId TEXT,
    _version INTEGER DEFAULT 1,
    _is_deleted INTEGER DEFAULT 0,
    _plaquetado INTEGER DEFAULT 0,
    _plaquetaMaster TEXT,
    _descricaoMaster TEXT,
    _aprovado INTEGER DEFAULT 0,
    _dataAprovacao TEXT,
    _aprovador TEXT,
    _assinatura TEXT,
    _isNew INTEGER DEFAULT 0,
    _is_unitized INTEGER DEFAULT 0,
    _is_divergent_baixa INTEGER DEFAULT 0,
    _parent_id TEXT,
    _is_synced INTEGER DEFAULT 0,
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
    DE_PARA TEXT,
    AUDITOR_STATUS_CONFERENCIA TEXT,
    _origemTransacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets (ETIQUETA);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta_unit ON assets (ETIQUETA, UNIDADE_OPERACIONAL);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta_unitid ON assets (ETIQUETA, _unitid);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (TAG_INVENTARIO);
CREATE INDEX IF NOT EXISTS idx_assets_endereco ON assets (ENDERECO);
CREATE INDEX IF NOT EXISTS idx_assets_localmaster ON assets (_localMaster);

CREATE TABLE IF NOT EXISTS localidades (
    id TEXT PRIMARY KEY,
    DESCRICAO TEXT,
    CODIGO TEXT,
    _tenantid TEXT,
    _unitid TEXT
);
CREATE INDEX IF NOT EXISTS idx_localidades_descricao ON localidades (DESCRICAO COLLATE NOCASE);

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
    nativeFileName: 'auditoria_soberana.db',
    nativePathKey: 'sqlite_native_path'
  };

  private nativePath: string | null = null;


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
    if (Capacitor.isNativePlatform()) {
      return { 
        status: 'linked', 
        fileName: this.storageKeys.nativeFileName, 
        path: `Directory.Data/${this.storageKeys.nativeFileName}` 
      };
    }
    
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
          if (!columns.includes('_tenantid')) this.db.run("ALTER TABLE campaigns ADD COLUMN _tenantid TEXT");
          if (!columns.includes('_unitid')) this.db.run("ALTER TABLE campaigns ADD COLUMN _unitid TEXT");
        }
        
        if (table === 'assets') {
          const required = [
            'DESCRICAODOATIVO', 'CENTRODECUSTO', 'CONTACONTABIL', 'QT',
            '_campaignId', '_tenantid', '_unitid', '_version', '_is_deleted',
            '_conferido', '_lastUpdated', '_is_synced', '_parent_id',
            '_localMaster', '_dataLeitura', '_auditor', '_photoUrl', '_lat', '_lng',
            '_is_unitized', '_is_divergent_baixa', '_isNew', 'DE_PARA', 
            'AUDITOR_STATUS_CONFERENCIA', '_origemTransacao'
          ];
          
          for (const col of required) {
            if (!columns.includes(col)) {
              const type = col.startsWith('_is') || col === '_version' || col === '_conferido' ? 'INTEGER DEFAULT 0' : 'TEXT';
              this.db.run(`ALTER TABLE assets ADD COLUMN ${col} ${type}`);
              
              // Migração de Legado (Se existirem colunas antigas)
              if (col === 'DESCRICAODOATIVO' && columns.includes('DESCRICAODOBEM')) {
                this.db.run("UPDATE assets SET DESCRICAODOATIVO = DESCRICAODOBEM WHERE DESCRICAODOATIVO IS NULL");
              }
              if (col === 'CENTRODECUSTO' && columns.includes('CC_CUSTO')) {
                this.db.run("UPDATE assets SET CENTRODECUSTO = CC_CUSTO WHERE CENTRODECUSTO IS NULL");
              }
              if (col === 'CONTACONTABIL' && columns.includes('CONTA_CONTABIL')) {
                this.db.run("UPDATE assets SET CONTACONTABIL = CONTA_CONTABIL WHERE CONTACONTABIL IS NULL");
              }
            }
          }
          
          // Garantir valores padrão para colunas vitais
          if (columns.includes('_version')) {
             this.db.run("UPDATE assets SET _version = 1 WHERE _version IS NULL");
          }
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
            this.nativePath = `${Directory.Data}/${this.storageKeys.nativeFileName}`;
            console.log(`>>> [NativeBridge] Banco de Dados NATIVO carregado: ${this.nativePath}`);
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
          this.nativePath = `${Directory.Data}/${this.storageKeys.nativeFileName}`;
          console.log(`>>> [NativeBridge] SINCRO NATIVA: Sucesso em ${this.nativePath}`);
          this.storageSource = 'PHYSICAL';
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

  async query(sql: string, params: (string | number | boolean | null)[] = []): Promise<Record<string, string | number | boolean | null>[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params as (string | number | boolean | null)[]);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, string | number | boolean | null>);
      }
      stmt.free();
      return rows;
    } catch (err) {
      console.error("Query failed:", sql, err);
      return [];
    }
  }

  async execute(sql: string, params: (string | number | boolean | null)[] = []) {
    if (!this.db) await this.init();
    if (!this.db) return;
    try {
      this.db.run(sql, params as (string | number | boolean | null)[]);
      await this.saveDatabase();
    } catch (err) {
      console.error("Execute failed:", sql, err);
      throw err;
    }
  }

  // --- Ativos ---
  async getAssets(tenantId: string, unitId?: string | null): Promise<Asset[]> {
    let sql = "SELECT * FROM assets WHERE (_tenantid = ? OR GRUPO_EMPRESARIAL = ?) AND _is_deleted = 0";
    const params: (string | number | boolean | null)[] = [tenantId, tenantId];
    if (unitId) {
      sql += " AND (_unitid = ? OR UNIDADE_OPERACIONAL = ?)";
      params.push(unitId, unitId);
    }
    return await this.query(sql, params) as unknown as Asset[];
  }

  async saveAsset(asset: Asset) {
    const validKeys = Object.keys(asset).filter(k => DB_ASSET_COLUMNS.includes(k));
    const cols = validKeys.join(', ');
    const placeholders = validKeys.map(() => '?').join(', ');
    const values = validKeys.map(k => asset[k as keyof Asset]);
    await this.execute(`INSERT OR REPLACE INTO assets (${cols}) VALUES (${placeholders})`, values);
  }

  async saveAssetsBatch(assets: Asset[]) {
    if (!this.db || assets.length === 0) return;
    try {
      this.db.run("BEGIN TRANSACTION");
      for (const asset of assets) {
        const validKeys = Object.keys(asset).filter(k => DB_ASSET_COLUMNS.includes(k));
        const cols = validKeys.join(', ');
        const placeholders = validKeys.map(() => '?').join(', ');
        const values = validKeys.map(k => asset[k as keyof Asset]);
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
  private normalizeCampaign(row: Record<string, string | number | boolean | null>): InventoryCampaign {
    if (!row) return row as unknown as InventoryCampaign;
    return {
      ...row,
      // Normalização de Unidade
      unit_id: (String(row.unit_id || row._unitid || '')).trim(),
      _unitid: (String(row.unit_id || row._unitid || '')).trim(),
      // Normalização de Tenant
      tenant_id: (String(row.tenant_id || row._tenantid || '')).trim(),
      _tenantid: (String(row.tenant_id || row._tenantid || '')).trim(),
      tenantId: (String(row.tenant_id || row._tenantid || '')).trim(),
      // Garantia de Status
      status: (row.status as string) || 'CREATED'
    } as unknown as InventoryCampaign;
  }

  async getCampaigns(tenantId: string): Promise<InventoryCampaign[]> {
    console.log(`>>> [Governance] SQL Query: SELECT * FROM campaigns WHERE tenant_id = '${tenantId}'`);
    const rows = await this.query("SELECT * FROM campaigns WHERE tenant_id = ? OR _tenantid = ?", [tenantId, tenantId]);
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
  async getUnitConfigs(tenantId: string): Promise<Record<string, string | number | boolean | null>[]> {
    return await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tenantId]);
  }

  async getAssetCount(): Promise<number> {
    const res = await this.query("SELECT COUNT(*) as count FROM assets WHERE _is_deleted = 0");
    return (res[0]?.count as number) || 0;
  }

  async getOperationalUnits(): Promise<string[]> {
    const res = await this.query("SELECT DISTINCT UNIDADE_OPERACIONAL FROM assets WHERE UNIDADE_OPERACIONAL IS NOT NULL AND UNIDADE_OPERACIONAL != ''");
    return res.map(row => row.UNIDADE_OPERACIONAL as string);
  }

  async checkTableSchema(tableName: string): Promise<Record<string, string | number | boolean | null>[]> {
    return await this.query(`PRAGMA table_info(${tableName})`);
  }

  async bulkInsertAssets(assets: Asset[]) {
    return await this.saveAssetsBatch(assets);
  }

  async getAllAssets(): Promise<Asset[]> {
    return await this.query("SELECT * FROM assets WHERE _is_deleted = 0") as unknown as Asset[];
  }

  async saveUnitConfigSql(config: Record<string, unknown>) {
    const tenantId = (config._tenantid as string) || 'CICOPAL';
    await this.execute("INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)", 
      [tenantId, tenantId, JSON.stringify(config)]);
  }

  async getDb() { return this.db; }

  getNativePath() { return this.nativePath; }

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
    if (Capacitor.isNativePlatform()) {
      return await this.init(true);
    }
    let targetHandle = handle;
    if (!targetHandle) {
      try {
        if (typeof window.showOpenFilePicker !== 'function') {
           throw new Error("API showOpenFilePicker não disponível.");
        }
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
    if (Capacitor.isNativePlatform()) return false;
    try {
      if (typeof window.showOpenFilePicker !== 'function') return false;
      // @ts-expect-error showOpenFilePicker is experimental
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] } }],
      });
      if (handle) await this.linkFile(handle);
      return !!handle;
    } catch { return false; }
  }

  async createPhysicalFile(handle?: FileSystemFileHandle) {
    if (Capacitor.isNativePlatform()) {
      console.log(">>> [NativeBridge] Criando base nativa automática no Android...");
      await this.init(true); // Inicializa novo banco em memória
      await this.saveDatabase(); // Persiste no sistema de arquivos nativo
      return true;
    }

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

  async executeBatch(queries: {sql: string, params: (string | number | boolean | null)[]}[]) {
    if (!this.db) return;
    try {
      this.db.run("BEGIN TRANSACTION");
      for (const q of queries) {
        this.db.run(q.sql, q.params as (string | number | boolean | null)[]);
      }
      this.db.run("COMMIT");
      await this.saveDatabase();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  async getInventoryConfig(tenantId?: string): Promise<InventoryState | null> {
    const tid = tenantId || localStorage.getItem('app_last_tenant') || 'CICOPAL';
    const res = await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tid]);
    if (res.length > 0 && res[0].data) {
      try {
        return JSON.parse(res[0].data as string);
      } catch { return null; }
    }
    return null;
  }

  async saveInventoryConfig(config: InventoryState) {
    await this.saveUnitConfigSql(config);
  }

  async mapLocalFolder() {
    if (Capacitor.isNativePlatform()) {
      // No Android/iOS, o mapeamento é automático para o diretório de dados seguro.
      // Apenas confirmamos a saúde do banco.
      if (this.isInitialized && this.db) {
        return true;
      }
      return await this.init();
    }

    // Código legado para Web (FileSystem Access API)
    if (typeof window.showDirectoryPicker === 'function') {
        await window.showDirectoryPicker();
        // Implementar lógica de busca por arquivo específico ou criação se necessário
        // Por enquanto mantemos como estava no MainMenu para evitar quebra mas 
        // a intenção é migrar.
    } else {
        throw new Error("Funcionalidade de mapeamento de pasta disponível apenas em navegadores com suporte a File System Access API.");
    }
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

    if (Capacitor.isNativePlatform()) {
      try {
        let binary = "";
        const bytes = new Uint8Array(data);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);
        const fileName = `auditoria_backup_${new Date().getTime()}.db`;

        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents
        });
        
        console.log(`>>> [NativeBridge] Backup exportado para Documentos: ${fileName}`);
        alert(`Backup exportado com sucesso para a pasta Documentos do celular: ${fileName}`);
        return;
      } catch (err) {
        console.error(">>> [NativeBridge] Erro ao exportar backup nativo:", err);
        alert("Erro ao exportar backup: " + String(err));
        return;
      }
    }

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
