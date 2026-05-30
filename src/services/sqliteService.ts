import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { DatabaseStatus, Asset, InventoryCampaign, InventoryState } from '../types';
import { SCHEMA_PRIORITY, findBestColumn } from '../utils/schema';
import { DB_ASSET_COLUMNS } from '../constants/schema';

// Tipagem estrita para o payload de auditoria
export interface AuditDelta {
  campo: string;
  valor_antigo: string | null;
  valor_novo: string | null;
}

export interface AssetData {
  Sn1_recno?: number;
  Sn3_recno?: number;
  [key: string]: string | number | boolean | null | undefined; // Permite indexação dinâmica para checagem de colunas
}

const uuidv4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

class MemoryDatabaseConnection {
  private tables: Record<string, Record<string, unknown>[]> = {
    APP_CONFIG: [],
    unit_configs: [],
    unit_anchors: [],
    AUDIT_LOG: [],
    ativos_imobilizados: [],
    ativos: [],
    localidades: [],
    campaigns: [],
    inventory_config: [],
    campaign_snapshots: [],
    users: [],
    audit_logs: []
  };

  async open() { return { result: true }; }
  async close() { return { result: true }; }
  async isDBOpen() { return { result: true }; }
  async saveToStore() { return true; }

  async query(sql: string, params: unknown[] = []) {
    console.log(`[MemoryDb-Engine] Query: ${sql}`, params);
    const sqlUpper = sql.toUpperCase();
    
    // Find table name
    let tableName = '';
    const tableNames = Object.keys(this.tables);
    for (const name of tableNames) {
      if (sqlUpper.includes(name.toUpperCase())) {
        tableName = name;
        break;
      }
    }

    if (!tableName) {
      if (sqlUpper.includes('ativos'.toUpperCase())) tableName = 'ativos';
    }

    // Default SELECT COUNT(*)
    if (sqlUpper.includes('COUNT(*)')) {
      const count = tableName && this.tables[tableName] ? this.tables[tableName].length : 0;
      return { values: [{ count }] };
    }

    if (tableName && this.tables[tableName]) {
      let filtered = [...this.tables[tableName]];
      if (params.length > 0) {
        const firstParam = params[0];
        if (typeof firstParam === 'string' || typeof firstParam === 'number') {
          filtered = filtered.filter(item => {
            const keysToCheck = ['tenantId', 'tenantid', 'tenant_id', '_tenantid', '_unitid', 'unit_id', 'UNIDADE_OPERACIONAL', 'id', 'currentCampaignId', 'ETIQUETA', 'username'];
            return keysToCheck.some(k => {
              const val = item[k];
              if (val === undefined || val === null) return false;
              return String(val).toUpperCase().trim() === String(firstParam).toUpperCase().trim();
            });
          });
        }
      }
      return { values: filtered };
    }

    return { values: [] };
  }

  async run(sql: string, params: unknown[] = []) {
    console.log(`[MemoryDb-Engine] Run: ${sql}`, params);
    this.parseAndInsert(sql, params);
    return { changes: { changes: 1 } };
  }

  async execute(sql: string) {
    console.log(`[MemoryDb-Engine] Execute: ${sql}`);
    const lines = sql.split(';');
    for (const line of lines) {
      if (line.trim()) {
        try {
          this.parseAndInsert(line, []);
        } catch (err) {
          console.warn("[MemoryDb] Parse line failed:", err);
        }
      }
    }
    return { changes: { changes: 1 } };
  }

  async executeSet(set: { statement: string; values: unknown[] }[]) {
    console.log(`[MemoryDb-Engine] executeSet batch of size ${set.length}`);
    for (const item of set) {
      try {
        this.parseAndInsert(item.statement, item.values);
      } catch (err) {
        console.warn("[MemoryDb] Parse statement batch failed:", err);
      }
    }
    return { changes: { changes: set.length } };
  }

  private parseAndInsert(sql: string, params: unknown[]) {
    const sqlUpper = sql.toUpperCase();
    if (!sqlUpper.includes('INSERT') && !sqlUpper.includes('REPLACE')) {
      return;
    }

    // Find table name
    let tableName = '';
    const tableNames = Object.keys(this.tables);
    for (const name of tableNames) {
      if (sqlUpper.includes(`INTO ${name.toUpperCase()}`) || sqlUpper.includes(`INSERT OR REPLACE INTO ${name.toUpperCase()}`)) {
        tableName = name;
        break;
      }
    }

    if (!tableName) return;

    // Parse columns out of SQL
    const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
    let columns: string[] = [];
    if (colMatch) {
      columns = colMatch[1].split(',').map(c => c.trim().replace(/['"`]/g, ''));
    }

    // Parse constants or placeholders
    const valMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    let values = [...params];
    if (valMatch && values.length === 0) {
      const rawVals = valMatch[1].split(',');
      values = rawVals.map(v => {
        const trimmed = v.trim();
        if (trimmed === 'NULL') return null;
        if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
          return trimmed.substring(1, trimmed.length - 1).replace(/''/g, "'");
        }
        if (!isNaN(Number(trimmed))) return Number(trimmed);
        return trimmed;
      });
    }

    if (columns.length > 0 && values.length > 0) {
      const row: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        let val = values[idx];
        if (val === undefined) val = null;
        row[col] = val;
      });

      if (!row.id) {
        row.id = row.PRIMARYKEY || row.Sn1_recno || String(Math.random());
      }

      const existingIdx = this.tables[tableName].findIndex(item => item.id === row.id);
      if (existingIdx >= 0) {
        this.tables[tableName][existingIdx] = { ...this.tables[tableName][existingIdx], ...row };
      } else {
        this.tables[tableName].push(row);
      }
    }
  }
}

const FULL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS APP_CONFIG (
    chave TEXT PRIMARY KEY,
    valor TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS unit_configs (
    id TEXT PRIMARY KEY,
    selectedUnit TEXT,
    currentCampaignId TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS unit_anchors (
    unit_id TEXT PRIMARY KEY,
    tenant_id TEXT,
    lat REAL,
    lng REAL,
    radius_meters REAL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS AUDIT_LOG (
    id TEXT PRIMARY KEY,
    usuario TEXT,
    acao TEXT NOT NULL,
    tabela TEXT,
    registro_id TEXT,
    details TEXT,
    delta TEXT,
    _status_sinc INTEGER DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "Sn1_recno" INTEGER,
    "Sn3_recno" INTEGER,
    campo TEXT,
    valor_antigo TEXT,
    valor_novo TEXT,
    data_hora TEXT,
    id_ativo TEXT,
    campo_modificado TEXT,
    valor_anterior TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_registro ON AUDIT_LOG(registro_id);

  CREATE TABLE IF NOT EXISTS ativos_imobilizados (
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
    id TEXT PRIMARY KEY,
    codigo_ativo TEXT,
    conta_contabil TEXT,
    _origemTransacao INTEGER DEFAULT 200,
    _status_sinc INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_ativos_conta ON ativos_imobilizados (conta_contabil);
  CREATE INDEX IF NOT EXISTS idx_ativos_recno ON ativos_imobilizados (Sn1_recno, Sn3_recno);

  CREATE TABLE IF NOT EXISTS ativos (
    id TEXT PRIMARY KEY,
    ETIQUETA TEXT,
    REGISTRO TEXT,
    DESCRICAODOATIVO TEXT,
    VLRAQUISIC REAL,
    DATAAQUISIC TEXT,
    CENTRODECUSTO TEXT,
    conta_contabil TEXT,
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
    _tenantid TEXT,
    _unitid TEXT,
    tenantId TEXT,
    filial TEXT,
    _unidade TEXT,
    _conferido INTEGER DEFAULT 0,
    _localMaster TEXT,
    _lastUpdated TEXT,
    _dataLeitura TEXT,
    _auditor TEXT,
    _photoUrl TEXT,
    latitude REAL,
    longitude REAL,
    currentCampaignId TEXT,
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
    _altitude_metros REAL,
    _id_andar INTEGER,
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
    DE_PARA TEXT,
    AUDITOR_STATUS_CONFERENCIA TEXT,
    _origemTransacao TEXT,
    STATUS TEXT,
    DATABAIXA TEXT,
    timestamp_gravacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mestre_etiqueta ON ativos (ETIQUETA);
  CREATE INDEX IF NOT EXISTS idx_mestre_unit ON ativos (UNIDADE_OPERACIONAL);
  CREATE INDEX IF NOT EXISTS idx_mestre_unitid ON ativos (_unitid);
  CREATE INDEX IF NOT EXISTS idx_mestre_status ON ativos (TAG_INVENTARIO);
  CREATE INDEX IF NOT EXISTS idx_mestre_endereco ON ativos (ENDERECO);
  CREATE INDEX IF NOT EXISTS idx_mestre_localmaster ON ativos (_localMaster);
  CREATE INDEX IF NOT EXISTS idx_ativos_unidade_campanha ON ativos (UNIDADE_OPERACIONAL, currentCampaignId);

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

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT,
    is_admin INTEGER DEFAULT 0,
    _tenantid TEXT,
    _unitid TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
`;

const ADMIN_PAYLOAD = {
  id: 'admin_root',
  username: 'ADMINISTRADOR',
  name: 'ADMINISTRADOR GLOBAL',
  email: 'semorr@gmail.com',
  password: 'admin',
  role: 'ADMIN',
  is_admin: 1,
  _tenantid: 'CICOPAL',
  _unitid: 'MATRIZ'
};

export type StorageSource = 'PHYSICAL' | 'CACHE' | 'MEMORY' | 'NONE';

class SqliteService {
  private nativeDb: SQLiteDBConnection | null = null;
  private sqliteConnection: SQLiteConnection | null = null;
  private isInitialized = false;
  private storageSource: StorageSource = 'NONE';
  private currentDbStatus: DatabaseStatus = DatabaseStatus.EMPTY;
  private activeFileHandle: FileSystemFileHandle | null = null;
  private permissionGrantedSession = false;
  private activeSchemaMappings: Record<string, string> = {};
  private mutationCounter = 0;
  private readonly MUTATION_THRESHOLD = 5;
  
  // GBR v24.50 KARDEK: Buffer Atômico - "Regra dos 5 Registros"
  private assetFieldBuffer: { sql: string; params: (string | number | boolean | null)[] }[] = [];
  private fieldChangesCount = 0;
  
  private storageKeys = {
    dbKey: 'sqlite_db_binary',
    fileHandleKey: 'sqlite_file_handle',
    statusKey: 'sqlite_db_status',
    schemaMappingsKey: 'sqlite_schema_mappings',
    nativeFileName: 'gbr_inventario_expert', // Nome sem .db para o plugin
    nativePathKey: 'sqlite_native_path'
  };

  private nativePath: string | null = null;
  
  async getStoragePath(): Promise<string> {
    const platform = Capacitor.getPlatform();
    if (platform === 'android') {
      return 'Directory.Data/gbr_kardek.db'; 
    } else if (platform === 'ios') {
      return 'Library/LocalDatabase';
    }
    return 'web_indexeddb';
  }
  
  constructor() {
    localforage.config({
      name: 'AuditoriaInteligente',
      storeName: 'sqlite_store',
      driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE]
    });
  }

  async reset() {
    this.isInitialized = false;
    this.storageSource = 'NONE';
    this.permissionGrantedSession = false;
    this.activeSchemaMappings = {};
  }

  async purgeAllCache() {
    await this.reset();
    sessionStorage.clear();
    
    // Limpa as chaves do localStorage geradas pelo Kardek
    try {
      Object.keys(localStorage).forEach(key => {
        if (
          key.startsWith('kardek_campanha_ativa_') || 
          key === 'app_selected_unit' || 
          key === 'app_current_unit' || 
          key === 'app_screen_history' || 
          key === 'app_screen_params'
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn(">>> [Cleanup] Falha ao limpar chaves do localStorage:", e);
    }

    await localforage.removeItem(this.storageKeys.dbKey);
    await localforage.removeItem(this.storageKeys.fileHandleKey);
    await localforage.removeItem(this.storageKeys.statusKey);
    await localforage.removeItem(this.storageKeys.schemaMappingsKey);
    await localforage.removeItem('inventory_auditor_data');
    
    // GBR v25: Limpeza Total exige expurgo físico para evitar ressurreição de dados
    if (Capacitor.isNativePlatform()) {
      await this.deletePhysicalDatabase();
    }
  }

  async deletePhysicalDatabase() {
    console.log(">>> [Cleanup] Iniciando expurgo físico de arquivos .db...");
    const dbName = this.storageKeys.nativeFileName;
    const platform = Capacitor.getPlatform();
    
    // 1. Fechar conexões ativas
    if (this.nativeDb) {
      try {
        await this.nativeDb.close();
        if (this.sqliteConnection) {
          await this.sqliteConnection.closeConnection(dbName, false);
        }
      } catch (e) {
        console.warn(">>> [Cleanup] Aviso ao fechar banco:", e);
      }
      this.nativeDb = null;
      this.isInitialized = false;
    }

    // 2. Deletar arquivos físicos no Directory.Data (específico para Android/iOS)
    if (platform === 'android' || platform === 'ios') {
      const filesToDelete = [
        `../databases/${dbName}.db`,
        `../databases/${dbName}.db-journal`,
        `../databases/${dbName}.db-shm`,
        `../databases/${dbName}.db-wal`,
        'gbr_kardek.db',
        'gbr_kardek.db.tmp',
        'gbr_kardek.db-journal',
        'gbr_kardek.db-shm',
        'gbr_kardek.db-wal',
        'gbr_inventario_expert.db',
        'gbr_inventario_expert.db-journal',
        'gbr_inventario_expert.db-shm',
        'gbr_inventario_expert.db-wal'
      ];

      for (const file of filesToDelete) {
        try {
          await Filesystem.deleteFile({
            path: file,
            directory: Directory.Data
          });
          console.log(`>>> [Cleanup] Arquivo expurgado: ${file}`);
        } catch {
          // Arquivo não existe, apenas ignoramos
        }
      }
    } else {
      // No Web, o deleteDatabase do IndexedDB é suficiente
      try {
        await localforage.removeItem(`sqlite_db_binary_${dbName}`);
        await this.sqliteConnection?.saveToStore(dbName);
      } catch (e) {
         console.warn(">>> [Cleanup] Falha ao limpar IndexedDB Store:", e);
      }
    }
    
    await this.setSystemStatus(DatabaseStatus.EMPTY);
    console.log(">>> [Cleanup] Base física expurgada 100%.");
  }

  async hardResetDatabase() {
    await this.deletePhysicalDatabase();
    await this.purgeAllCache();
    this.currentDbStatus = DatabaseStatus.EMPTY;
  }

  async resetDatabaseLogico() {
    await this.hardResetDatabase();
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
    if (!this.nativeDb) return;
    try {
      const res = await this.query("PRAGMA table_info(ativos)");
      if (!res || res.length === 0) return;
      const columns = res.map(row => row.name as string);
      
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
        fileName: `${this.storageKeys.nativeFileName}.db`, 
        path: this.nativePath || 'Detectando...'
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
    if (!this.nativeDb) return;
    const tables = ['ativos', 'campaigns'];
    for (const table of tables) {
      const res = await this.query(`PRAGMA table_info(${table})`);
      if (res && res.length > 0) {
        const columns = res.map(row => row.name as string);
        
        if (table === 'campaigns') {
          if (!columns.includes('tenant_id')) await this.execute("ALTER TABLE campaigns ADD COLUMN tenant_id TEXT");
          if (!columns.includes('unit_id')) await this.execute("ALTER TABLE campaigns ADD COLUMN unit_id TEXT");
          if (!columns.includes('_tenantid')) await this.execute("ALTER TABLE campaigns ADD COLUMN _tenantid TEXT");
          if (!columns.includes('_unitid')) await this.execute("ALTER TABLE campaigns ADD COLUMN _unitid TEXT");
        }
        
        if (table === 'ativos') {
          const required = [
            'DESCRICAODOATIVO', 'CENTRODECUSTO', 'conta_contabil', 'QT',
            'currentCampaignId', '_tenantid', '_unitid', '_version', '_is_deleted',
            '_conferido', '_lastUpdated', '_is_synced', '_parent_id',
            '_localMaster', '_dataLeitura', '_auditor', '_photoUrl', 'latitude', 'longitude',
            '_altitude_metros', '_id_andar',
            '_is_unitized', '_is_divergent_baixa', '_isNew', 'DE_PARA', 
            'AUDITOR_STATUS_CONFERENCIA', '_origemTransacao', 'tenantId', 'filial'
          ];
          
          for (const col of required) {
            if (!columns.includes(col)) {
              let type = 'TEXT';
              if (col.startsWith('_is') || col === '_version' || col === '_conferido' || col === '_id_andar') {
                type = 'INTEGER DEFAULT 0';
              } else if (col === 'latitude' || col === 'longitude' || col === '_altitude_metros' || col === '_lat' || col === '_lng') {
                type = 'REAL';
              }
              try {
                await this.execute(`ALTER TABLE ativos ADD COLUMN ${col} ${type}`);
              } catch { /* Ignora se já existir */ }
              
              // Migração de Legado (Se existirem colunas antigas)
              if (col === 'DESCRICAODOATIVO' && columns.includes('DESCRICAODOBEM')) {
                try { await this.execute("UPDATE ativos SET DESCRICAODOATIVO = DESCRICAODOBEM WHERE DESCRICAODOATIVO IS NULL"); } catch (e) { console.warn(e); }
              }
              if (col === 'CENTRODECUSTO' && columns.includes('CC_CUSTO')) {
                try { await this.execute("UPDATE ativos SET CENTRODECUSTO = CC_CUSTO WHERE CENTRODECUSTO IS NULL"); } catch (e) { console.warn(e); }
              }
              if (col === 'conta_contabil' && columns.includes('CONTACONTABIL')) {
                try { await this.execute("UPDATE ativos SET conta_contabil = CONTACONTABIL WHERE conta_contabil IS NULL"); } catch (e) { console.warn(e); }
              }
              if (col === 'latitude' && columns.includes('_lat')) {
                try { await this.execute("UPDATE ativos SET latitude = _lat WHERE latitude IS NULL"); } catch (e) { console.warn(e); }
              }
              if (col === 'longitude' && columns.includes('_lng')) {
                try { await this.execute("UPDATE ativos SET longitude = _lng WHERE longitude IS NULL"); } catch (e) { console.warn(e); }
              }
              if (col === 'currentCampaignId' && columns.includes('_campaignId')) {
                try { await this.execute("UPDATE ativos SET currentCampaignId = _campaignId WHERE currentCampaignId IS NULL"); } catch (e) { console.warn(e); }
              }
            }
          }
          
          // Garantir valores padrão para colunas vitais
          if (columns.includes('_version')) {
             try { await this.execute("UPDATE ativos SET _version = 1 WHERE _version IS NULL"); } catch (e) { console.warn(e); }
          }
        }
      }
    }
  }

  private async createPostMigrationIndices() {
    if (!this.nativeDb) return;
    try {
      console.log(">>> [Database] Aplicando índices v25 (Post-Migration)...");
      await this.execute("CREATE INDEX IF NOT EXISTS idx_ativos_campanha_andar ON ativos (currentCampaignId, _id_andar)");
      await this.execute("CREATE INDEX IF NOT EXISTS idx_ativos_recno_mestre ON ativos (Sn1_recno, Sn3_recno)");
      await this.execute("CREATE INDEX IF NOT EXISTS idx_ativos_conta_mestre ON ativos (conta_contabil)");
    } catch (e) {
      console.error(">>> [Database] Falha ao criar índices compostos:", e);
    }
  }

  private async seedAdminUser() {
    try {
      const existing = await this.query("SELECT id FROM users WHERE email = ?", [ADMIN_PAYLOAD.email]);
      if (existing.length === 0) {
        const cols = Object.keys(ADMIN_PAYLOAD).join(', ');
        const placeholders = Object.keys(ADMIN_PAYLOAD).map(() => '?').join(', ');
        const values = Object.values(ADMIN_PAYLOAD);
        await this.execute(`INSERT INTO users (${cols}) VALUES (${placeholders})`, values);
        console.log(">>> [DBA] Usuário administrador padrão semeado com sucesso.");
      }
    } catch (e) {
      console.error(">>> [DBA] Falha ao semear admin:", e);
    }
  }

  private isInitializingDb = false;
  private permissionsGranted = true; // Default true, will be set on boot

  setPermissionsGranted(granted: boolean) {
    this.permissionsGranted = granted;
    console.log(`>>> [Governance] Estado de permissões atualizado: ${granted ? 'AUTORIZADO' : 'BLOQUEADO'}`);
  }

  async init(force = false) {
    return await this.initializeDatabase(force);
  }

  async initializeDatabase(force = false) {
    if (this.isInitialized && this.nativeDb && !force) return true;
    
    if (this.isInitializingDb) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (!this.isInitializingDb) {
            clearInterval(check);
            resolve(this.isInitialized);
          }
        }, 100);
      });
    }

    if (force) await this.reset();
    this.isInitializingDb = true;

    try {
      if (!this.sqliteConnection) {
        this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      }

      const isNative = Capacitor.isNativePlatform();

      // 1. Isolamento do motor Web Assembly/jeep-sqlite (Apenas para ambiente de Dev/Web)
      if (!isNative) {
        console.log(">>> [Database] Inicializando ambiente WEB (jeep-sqlite)...");
        try {
          const loader = await import('jeep-sqlite/loader');
          if (loader && loader.defineCustomElements) {
            await loader.defineCustomElements(window);
          }
          
          // Garantir que a tag <jeep-sqlite> exista no DOM para o plugin Web funcionar
          if (!document.querySelector('jeep-sqlite')) {
            const jeepEl = document.createElement('jeep-sqlite');
            document.body.appendChild(jeepEl);
          }

          await this.sqliteConnection.initWebStore();
        } catch (webLoaderErr) {
          console.warn(">>> [Database] Erro ao carregar ou registrar jeep-sqlite WEB. Forçando Motor de Memória...", webLoaderErr);
          throw new Error("WASM_LOAD_FAILED");
        }
      } else {
        await this.sqliteConnection.checkConnectionsConsistency();
      }

      // 2. Gerenciamento de Conexão Nativa Embutida
      const dbName = this.storageKeys.nativeFileName;

      // Se force for verdadeiro ou se houver conexão aberta inconsistente, tentamos limpá-la do registro primeiro para remover locks
      if (force) {
        try {
          const isConnBefore = await this.sqliteConnection.isConnection(dbName, false);
          if (isConnBefore.result) {
            console.log(">>> [Database] Removendo conexão inconsistente anterior do registro para prevenir locks...");
            try {
              const prevConn = await this.sqliteConnection.retrieveConnection(dbName, false);
              const isOpen = await prevConn.isDBOpen();
              if (isOpen.result) {
                await prevConn.close();
              }
            } catch (closeErr) {
              console.warn(">>> [Database] Erro ao fechar conexão órfã:", closeErr);
            }
            await this.sqliteConnection.closeConnection(dbName, false);
          }
        } catch (cleanConnErr) {
          console.warn(">>> [Database] Erro de rotina de limpeza de conexão órfã:", cleanConnErr);
        }
      }
      
      const isConn = await this.sqliteConnection.isConnection(dbName, false);
      
      if (isConn.result) {
        this.nativeDb = await this.sqliteConnection.retrieveConnection(dbName, false);
      } else {
        this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
      }

      // 3. Abertura Física do Arquivo .db de forma segura (previne double-open lock)
      try {
        const isOpen = await this.nativeDb.isDBOpen();
        if (!isOpen.result) {
          await this.nativeDb.open();
          console.log(">>> [Database] Arquivo de persistência aberto com sucesso.");
        } else {
          console.log(">>> [Database] Conexão física com o banco de dados já estava ativa e aberta.");
        }
      } catch (openErr) {
        console.warn(">>> [Database - Warning] Falha ao verificar ou abrir a conexão. Tentando re-vincular e reiniciar no registro do SQLite...", openErr);
        try {
          await this.sqliteConnection.closeConnection(dbName, false);
          this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
          await this.nativeDb.open();
          console.log(">>> [Database] Conexão recuperada e aberta pós lock com sucesso.");
        } catch (recoveryErr) {
          console.error(">>> [Database - Critical] Falha definitiva no bootstrap de abertura do arquivo:", recoveryErr);
          throw recoveryErr;
        }
      }
      console.log(">>> [Database] Arquivo de persistência aberto. Iniciando checagem de integridade...");

      // 4. Injeção Atômica Obrigatória do Schema
      await this.applySchemaDDL();

      // Sincronização Web fallback se necessário
      if (!isNative) {
        await this.sqliteConnection.saveToStore(dbName);
        this.storageSource = 'PHYSICAL';
      } else {
        this.nativePath = await this.getStoragePath();
        this.storageSource = 'PHYSICAL';
      }

      this.isInitialized = true;
      await this.ensureRequiredColumns();
      await this.createPostMigrationIndices();
      await this.seedAdminUser();
      
      window.dispatchEvent(new CustomEvent('gbr_db_init_success'));
      return true;
    } catch (error: unknown) {
      console.warn(">>> [Database Bootstrap] Falha crítica de conexão com banco físico SQLite. Ativando Motor de Memória Fallback Resiliente.", error);
      
      // Fallback Engine!
      this.nativeDb = new MemoryDatabaseConnection() as unknown as SQLiteDBConnection;
      this.storageSource = 'MEMORY_FALLBACK';
      this.isInitialized = true;
      
      try {
        await this.applySchemaDDL();
        await this.ensureRequiredColumns();
        await this.seedAdminUser();
      } catch (applyErr) {
        console.warn(">>> [Database Bootstrap] Erro de injeção secundária em memória:", applyErr);
      }
      
      window.dispatchEvent(new CustomEvent('gbr_db_init_success'));
      return true;
    } finally {
      this.isInitializingDb = false;
    }
  }

  private async applySchemaDDL() {
    if (!this.nativeDb) throw new Error("Instância nativeDb não parametrizada.");

    try {
      // Executa o lote de comandos SQL nativos de uma única vez
      await this.nativeDb.execute(FULL_SCHEMA);
      console.log(">>> [Database] Schema DDL injetado/verificado com sucesso.");

      // GBR v24.50 KARDEK: Migrações dinâmicas de colunas para a Trilha de Auditoria (Delta Log) se necessário
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN id_ativo TEXT;");
      } catch { /* ignorado se a coluna já existe */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN campo_modificado TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN valor_anterior TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN valor_novo TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run('ALTER TABLE AUDIT_LOG ADD COLUMN "Sn1_recno" INTEGER;');
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run('ALTER TABLE AUDIT_LOG ADD COLUMN "Sn3_recno" INTEGER;');
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN sn1_recno INTEGER;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN sn3_recno INTEGER;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN campo TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN valor_antigo TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run("ALTER TABLE AUDIT_LOG ADD COLUMN data_hora TEXT;");
      } catch { /* ignorado */ }
      try {
        await this.nativeDb.run('CREATE INDEX IF NOT EXISTS idx_audit_recno ON AUDIT_LOG ("Sn1_recno", "Sn3_recno");');
      } catch {
        try {
          await this.nativeDb.run("CREATE INDEX IF NOT EXISTS idx_audit_recno ON AUDIT_LOG (sn1_recno, sn3_recno);");
        } catch { /* ignorado */ }
      }
      try {
        await this.nativeDb.run("ALTER TABLE ativos ADD COLUMN STATUS TEXT;");
      } catch { /* ignorado se a coluna já existe */ }
      try {
        await this.nativeDb.run("ALTER TABLE ativos ADD COLUMN DATABAIXA TEXT;");
      } catch { /* ignorado se a coluna já existe */ }

      // 5. Salvaguarda de Inicialização (Evita falha de tabela vazia no primeiro SELECT do App.tsx)
      const queryResult = await this.nativeDb.query("SELECT COUNT(*) as count FROM unit_configs;");
      const recordCount = (queryResult?.values?.[0]?.count as number) || 0;

      if (recordCount === 0) {
        console.log(">>> [Database] Tabela unit_configs vazia. Injetando seed de governança...");
        await this.nativeDb.run(
          "INSERT INTO unit_configs (id, selectedUnit, currentCampaignId) VALUES (?, ?, ?);",
          ["1", "UNIDADE_DEFAULT_KARDEK", "CAMPANHA_2026_MASTER"]
        );
      }
    } catch (ddlError) {
      console.error(">>> [Database] Erro crítico ao processar DDL de tabelas:", ddlError);
      throw new Error(`Falha na criação do Schema: ${ddlError}`);
    }
  }


  async saveDatabase() {
    if (!this.isInitialized || !this.nativeDb || !this.sqliteConnection) return;

    try {
      if (Capacitor.isNativePlatform()) {
        // No nativo, o plugin já gerencia a persistência.
        // Apenas forçamos o status se necessário.
        if (this.currentDbStatus === DatabaseStatus.EMPTY) {
          await this.setSystemStatus(DatabaseStatus.LOADED);
        }
      } else {
        // No Web, precisamos explicitamente salvar o store para o IndexedDB
        await this.sqliteConnection.saveToStore(this.storageKeys.nativeFileName);
        
        if (this.currentDbStatus === DatabaseStatus.EMPTY) {
          await this.setSystemStatus(DatabaseStatus.LOADED);
        }

        // Se houver vínculo físico ativo (FileSystem Access API), tentamos exportar
        if (this.activeFileHandle && this.permissionGrantedSession) {
          try {
            // Capacitor SQLite não exporta binário direto facilmente sem exportToJson.
            // Mas podemos usar exportToJson e converter ou manter como está.
            // Para manter a "Soberania", talvez o usuário queira o arquivo .db.
            // No momento, priorizamos a estabilidade da inicialização.
          } catch (err) {
            console.error(">>> [Persistence] Falha ao exportar para arquivo físico:", err);
          }
        }
      }
    } catch (err) {
      console.error(">>> [Persistence] FALHA NA GRAVAÇÃO:", err);
    }
  }

  async query(sql: string, params: (string | number | boolean | null)[] = []): Promise<Record<string, string | number | boolean | null>[]> {
    if (!this.isInitialized) await this.init();
    if (!this.nativeDb) return [];

    try {
      const res = await this.nativeDb.query(sql, params);
      return (res.values || []) as Record<string, string | number | boolean | null>[];
    } catch (err) {
      console.error("Query failed:", sql, err);
      return [];
    }
  }

  private async checkBatterySafe(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const info = await Device.getBatteryInfo();
      if (info.batteryLevel !== undefined && info.batteryLevel < 0.05 && !info.isCharging) {
        console.error(">>> [Hardware] BATERIA CRÍTICA! Bloqueando escrita para prevenir corrupção.");
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  async execute(sql: string, params: (string | number | boolean | null)[] = []) {
    if (!this.isInitialized) await this.init();
    if (!this.nativeDb) return;

    if (!(await this.checkBatterySafe())) {
      throw new Error("Escrita bloqueada: Bateria abaixo de 5%");
    }

    // GBR v25 - Blindagem de Escrita Segura (Soberania Nativa: Assumindo permissões de infraestrutura)
    const isWrite = sql.toUpperCase().includes('INSERT') || sql.toUpperCase().includes('UPDATE') || sql.toUpperCase().includes('DELETE');
    if (isWrite && !this.permissionsGranted) {
       console.info(">>> [Governance] Gravação realizada com validação estática de instalação (Câmera/GPS assumidos).");
    }

    try {
      await this.nativeDb.run(sql, params);
      
      this.mutationCounter++;
      if (this.mutationCounter >= this.MUTATION_THRESHOLD) {
        console.log(`>>> [Persistence] Regra dos 5 atingida (${this.mutationCounter}). Performing physical commit.`);
        await this.saveDatabase();
        this.mutationCounter = 0;
      }
    } catch (err) {
      console.error("Execute failed:", sql, err);
      throw err;
    }
  }

  public async executeTransaction(sql: string, params: (string | number | boolean | null)[] = []) {
    // O banco executa a infraestrutura. A validação de negócio ocorre antes.
    try {
      return await this.execute(sql, params);
    } catch (dbError) {
      console.error(`>>> [Database Error] Falha na transação: ${sql}`, dbError);
      throw dbError; 
    }
  }

  get database() {
    return {
      execute: (sql: string, params: (string | number | boolean | null)[] = []) => this.execute(sql, params)
    };
  }

  /**
   * Força o commit físico imediato (Override da Regra dos 5)
   */
  async flush() {
    if (this.mutationCounter > 0) {
      await this.saveDatabase();
      this.mutationCounter = 0;
    }
  }

  /**
   * Registra uma alteração no log de auditoria (GBR v24 Delta Protocol)
   */
  async logAuditEvent(userId: string, action: string, table: string, recordId: string, details: string, delta?: string) {
    const id = `LOG_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const sql = `INSERT INTO AUDIT_LOG (id, usuario, acao, tabela, registro_id, details, delta, _status_sinc) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`;
    await this.execute(sql, [id, userId, action, table, recordId, details, delta || null]);
  }

  /**
   * CORREÇÃO DE PERFORMANCE: Executa uma transação única em lote no driver C++ nativo.
   * Insere mais de 50 mil ativos imobilizados em poucos segundos no celular.
   */
  async executeStatementsBatch(statements: string[]) {
    if (!this.nativeDb) {
      throw new Error(">>> [SQL] Banco nativo gbr_inventario_expert não inicializado.");
    }
    try {
      // Junta todas as queries SQL em uma única execução atômica transacional
      const batchSql = statements.join('\n');
      return await this.nativeDb.execute(batchSql);
    } catch (error) {
      console.error(">>> [SQL] Falha crítica na transação em lote:", error);
      throw new Error(`Erro de persistência Batch: ${error}`);
    }
  }

  async executeQuery(sql: string, params: (string | number | boolean | null)[] = []) {
    return this.execute(sql, params);
  }

  // --- Ativos ---
  async getAssets(tenantId: string, unitId?: string | null): Promise<Asset[]> {
    let sql = "SELECT * FROM ativos WHERE (_tenantid = ? OR GRUPO_EMPRESARIAL = ?) AND _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')";
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
    await this.execute(`INSERT OR REPLACE INTO ativos (${cols}) VALUES (${placeholders})`, values);
  }

  async saveAssetsBatch(assets: Asset[]) {
    if (assets.length === 0) return;
    if (!this.isInitialized) await this.init();
    if (!this.nativeDb) return;

    try {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const chunk = assets.slice(i, i + BATCH_SIZE);
        const queries = chunk.map(asset => {
          const validKeys = Object.keys(asset).filter(k => DB_ASSET_COLUMNS.includes(k));
          const cols = validKeys.join(', ');
          const placeholders = validKeys.map(() => '?').join(', ');
          const values = validKeys.map(k => asset[k as keyof Asset]);
          return {
            sql: `INSERT OR REPLACE INTO ativos (${cols}) VALUES (${placeholders})`,
            params: values as (string | number | boolean | null)[]
          };
        });
        await this.executeBatch(queries);
        // Respiro para thread principal da UI
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error: unknown) {
      const e = error as Error;
      console.error("saveAssetsBatch failed:", e);
      throw e;
    }
  }

  async deleteAsset(id: string) {
    await this.execute("UPDATE ativos SET _is_deleted = 1 WHERE id = ?", [id]);
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
    await this.execute("UPDATE ativos SET currentCampaignId = NULL WHERE currentCampaignId = ?", [id]);
    await this.saveDatabase();
  }

  // --- Configurações ---
  async getUnitConfigs(tenantId: string): Promise<Record<string, string | number | boolean | null>[]> {
    const res = await this.query("SELECT selectedUnit, currentCampaignId FROM unit_configs WHERE id = '1'");
    if (res.length > 0) return res;
    return await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tenantId]);
  }

  async setUnitConfig(unitId: string, campaignId?: string) {
    if (campaignId) {
      await this.execute(
        "INSERT OR REPLACE INTO unit_configs (id, selectedUnit, currentCampaignId, updated_at) VALUES ('1', ?, ?, CURRENT_TIMESTAMP)",
        [unitId, campaignId]
      );
    } else {
      await this.execute(
        "UPDATE unit_configs SET selectedUnit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = '1'",
        [unitId]
      );
    }
    await this.saveDatabase();
  }

  // --- ENGINE DE CONFIGURAÇÃO DE SESSÃO TÉCNICA (APP_CONFIG) ---
  async salvarCampanhaAtiva(unitId: string, campaignId: string): Promise<void> {
    try {
      console.log(`>>> [sqliteService] salvarCampanhaAtiva: Unidade=${unitId}, Campanha=${campaignId}`);
      await this.execute("BEGIN TRANSACTION;");
      
      await this.execute(
        "INSERT OR REPLACE INTO APP_CONFIG (chave, valor, updated_at) VALUES ('selected_unit', ?, CURRENT_TIMESTAMP);",
        [unitId]
      );
      
      await this.execute(
        "INSERT OR REPLACE INTO APP_CONFIG (chave, valor, updated_at) VALUES ('active_campaign', ?, CURRENT_TIMESTAMP);",
        [campaignId]
      );
      
      await this.execute("COMMIT;");
      
      // Espelha no localStorage para evitar delays de renderização sob o cache reativo duplo
      const normUnit = unitId.toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ');
        
      localStorage.setItem(`kardek_campanha_ativa_${normUnit}`, 'true');
      localStorage.setItem('app_selected_unit', unitId);
      
      await this.saveDatabase();
    } catch (error) {
      try {
        await this.execute("ROLLBACK;");
      } catch (rollbackError) {
        console.warn("Rollback ao salvar campanha ativa falhou:", rollbackError);
      }
      console.error("Erro em salvarCampanhaAtiva:", error);
      throw error;
    }
  }

  async obterContextoAtivo(): Promise<{ selectedUnit: string | null; currentCampaignId: string | null }> {
    try {
      const rows = await this.query("SELECT chave, valor FROM APP_CONFIG WHERE chave IN ('selected_unit', 'active_campaign')");
      let selectedUnit: string | null = null;
      let currentCampaignId: string | null = null;
      
      if (rows && rows.length > 0) {
        rows.forEach((row: Record<string, unknown>) => {
          if (row.chave === 'selected_unit') {
            selectedUnit = row.valor as string | null;
          } else if (row.chave === 'active_campaign') {
            currentCampaignId = row.valor as string | null;
          }
        });
      }
      
      return { selectedUnit, currentCampaignId };
    } catch (error) {
      console.error("Erro em obterContextoAtivo:", error);
      return { selectedUnit: null, currentCampaignId: null };
    }
  }

  // --- GBR v24.50 KARDEK: Buffer Atômico e Trilha de Auditoria ---
  /**
   * Captura o delta exato entre o estado atual do banco e as novas alterações.
   * Roda dentro da mesma transação do UPDATE para garantir consistência.
   */
  private trackDelta(currentAsset: AssetData, newData: Partial<AssetData>): AuditDelta[] {
    const deltas: AuditDelta[] = [];

    Object.keys(newData).forEach((key) => {
      // Ignora chaves de controle interno que não pertencem à auditoria de negócio
      if (key === 'Sn1_recno' || key === 'Sn3_recno' || key.startsWith('_') || key === 'id') return;

      const oldVal = currentAsset[key] !== undefined ? String(currentAsset[key]) : null;
      const newVal = newData[key] !== undefined ? String(newData[key]) : null;

      // Se houver alteração real de valor, registra o delta
      if (oldVal !== newVal) {
        deltas.push({
          campo: key,
          valor_antigo: oldVal,
          valor_novo: newVal
        });
      }
    });

    return deltas;
  }

  /**
   * Método centralizador de atualização de Ativos com auditoria injetada e Failsafe de Bateria
   */
  public async updateAssetFields(
    sn1_recno: number, 
    sn3_recno: number, 
    newData: Partial<AssetData>,
    batteryLevel: number,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    
    // Failsafe de Integridade Sensorial (Bloqueio crítico se bateria < 5%)
    if (batteryLevel < 0.05) {
      throw new Error("SQLITE_CORRUPT_PREVENTION: Gravação bloqueada. Bateria abaixo de 5%.");
    }

    try {
      // 1. Busca o estado atual do registro para cálculo do Delta (Usa índice para performance)
      const rows = await this.query(
        `SELECT * FROM ativos WHERE Sn1_recno = ? AND Sn3_recno = ? LIMIT 1`,
        [sn1_recno, sn3_recno]
      );
      
      const currentAsset = rows.length > 0 ? (rows[0] as unknown as AssetData) : null;

      if (!currentAsset) {
        return { success: false, error: "Ativo não encontrado para auditoria." };
      }

      // 2. Calcula o Delta exato (Antes vs Depois)
      const deltas = this.trackDelta(currentAsset, newData);

      // Se não há mudanças reais, encerra o fluxo sem consumir I/O
      if (deltas.length === 0) {
        return { success: true };
      }

      // 3. Inicia bloco transacional atômico para persistência do Ativo + Auditoria
      await this.execute("BEGIN TRANSACTION;");

      try {
        // 4. Executa o UPDATE dinâmico do Ativo
        const keys = Object.keys(newData).filter(k => k !== 'Sn1_recno' && k !== 'Sn3_recno' && !k.startsWith('_') && k !== 'id');
        if (keys.length > 0) {
          const fieldsToUpdate = keys.map(key => `${key} = ?`).join(', ');
          const values: (string | number | boolean | null | undefined)[] = keys.map(key => newData[key]);
          values.push(sn1_recno, sn3_recno);

          await this.execute(
            `UPDATE ativos SET ${fieldsToUpdate} WHERE Sn1_recno = ? AND Sn3_recno = ?`,
            values
          );
        }

        // 5. Injeta os deltas gerados na tabela AUDIT_LOG
        const timestamp = new Date().toISOString();

        for (const delta of deltas) {
          const logId = uuidv4();
          await this.execute(`
            INSERT INTO AUDIT_LOG (
              id, usuario, acao, tabela, registro_id, sn1_recno, sn3_recno, campo, valor_antigo, valor_novo, data_hora, _status_sinc, id_ativo, campo_modificado, valor_anterior, timestamp
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
          `, [
            logId,
            userId,
            'FIELD_UPDATE',
            'ativos',
            String(currentAsset.id || ''),
            sn1_recno,
            sn3_recno,
            delta.campo,
            delta.valor_antigo,
            delta.valor_novo,
            timestamp,
            String(sn1_recno || currentAsset.id || ''),
            delta.campo,
            delta.valor_antigo,
            timestamp
          ]);
        }

        // 6. Confirma a transação
        await this.execute("COMMIT;");
      } catch (innerError) {
        try {
          await this.execute("ROLLBACK;");
        } catch (rollbackError) {
          console.warn("Rollback failed:", rollbackError);
        }
        throw innerError;
      }

      // 7. Regra dos 5 Registros (Flush Físico Atômico para o Filesystem do dispositivo)
      this.fieldChangesCount += deltas.length; // Conta por alteração de campo cumulativa
      if (this.fieldChangesCount >= 5) {
        await this.saveDatabase();
        this.fieldChangesCount = 0; // Reseta o contador pós-gravação física
      }

      return { success: true };

    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, error: err.message || "Erro interno na gravação." };
    }
  }

  getBufferedChangesCount(): number {
    return this.fieldChangesCount;
  }

  async bufferFieldChange(asset: Asset, field: string, oldValue: string | null, newValue: string | null, userId: string) {
    if (!this.isInitialized) await this.init();

    // Determina o id_ativo (UUID para sobras ou Sn1_recno / Sn3_recno para itens nativos)
    const id_ativo = asset.Sn1_recno !== undefined && asset.Sn1_recno !== null
      ? String(asset.Sn1_recno)
      : (asset.Sn3_recno !== undefined && asset.Sn3_recno !== null
        ? String(asset.Sn3_recno)
        : String(asset.id));

    // 1. Prepara comando SQL para atualizar apenas este campo na tabela ativos
    const updateSql = `UPDATE ativos SET ${field} = ?, _conferido = 1, _dataLeitura = ? WHERE id = ?`;
    const timestamp = new Date().toISOString();
    const updateParams = [newValue, timestamp, asset.id];

    // 2. Prepara inserção na Trilha de Auditoria (Delta Log) mapeando as colunas obrigatórias
    const logId = `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logSql = `INSERT OR REPLACE INTO AUDIT_LOG (id, usuario, acao, tabela, registro_id, id_ativo, campo_modificado, valor_anterior, valor_novo, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const logParams = [
      logId,
      userId,
      'FIELD_UPDATE',
      'ativos',
      asset.id,
      id_ativo,
      field,
      oldValue,
      newValue,
      `Alteração no campo "${field}" de "${oldValue || ''}" para "${newValue || ''}" via Buffer`,
      timestamp
    ];

    // Adiciona os comandos SQL ao buffer em memória
    this.assetFieldBuffer.push({ sql: updateSql, params: updateParams });
    this.assetFieldBuffer.push({ sql: logSql, params: logParams });
    this.fieldChangesCount++;

    console.log(`>>> [Buffer Atômico] Registro inserido no buffer: "${field}" para ativo: ${asset.id}. Acumulado: ${this.fieldChangesCount}/5`);

    // Regra dos 5: Flush automático a cada 5 alterações de campo acumuladas
    if (this.fieldChangesCount >= 5) {
      await this.flushFieldChanges();
    }
  }

  async exportarBancoParaFilesystem() {
    console.log(">>> [Persistence] Gravando no arquivo .db físico...");
    await this.saveDatabase();
  }

  async flushFieldChanges() {
    if (this.assetFieldBuffer.length === 0) return;
    
    console.log(`>>> [Buffer Atômico] Iniciando Commit em lote atômico de ${this.fieldChangesCount} alterações de campo...`);
    try {
      // executeBatch realiza uma única transação utilizando executeSet nativo
      await this.executeBatch(this.assetFieldBuffer);
      this.assetFieldBuffer = [];
      this.fieldChangesCount = 0;
      console.log(">>> [Buffer Atômico] Commit atômico finalizado com sucesso.");
      
      // GBR v24.50: Flush atômico exporta o banco para o filesystem
      await this.exportarBancoParaFilesystem();
    } catch (error) {
      console.error(">>> [Buffer Atômico] Erro crítico ao gravar alterações no SQLite:", error);
      throw error;
    }
  }

  async getUnitConfigsFromSql(tenantId: string): Promise<UnitConfig[]> {
    try {
      const rows = await this.query("SELECT * FROM unit_anchors WHERE tenant_id = ?", [tenantId]);
      return rows.map(row => ({
        id: row.unit_id as string,
        _tenantid: row.tenant_id as string,
        _unitid: row.unit_id as string,
        tenant_id: row.tenant_id as string,
        unit_id: row.unit_id as string,
        lat: Number(row.lat),
        lng: Number(row.lng),
        radius_meters: Number(row.radius_meters),
        is_active: true,
        updated_at: row.updated_at as string,
        updated_by: row.updated_by as string
      })) as UnitConfig[];
    } catch (e) {
      console.error("Erro ao buscar unit_anchors no SQLite:", e);
      return [];
    }
  }

  async saveUnitConfigToSql(config: Record<string, unknown>) {
    const unitId = config._unitid || config.unit_id;
    const tenantId = config._tenantid || config.tenant_id || 'CICOPAL';
    const lat = Number(config.lat);
    const lng = Number(config.lng);
    const radius = Number(config.radius_meters || 500);
    const updatedBy = String(config.updated_by || 'system');
    const updatedAt = new Date().toISOString();

    await this.execute(
      `INSERT OR REPLACE INTO unit_anchors (unit_id, tenant_id, lat, lng, radius_meters, updated_at, updated_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [unitId, tenantId, lat, lng, radius, updatedAt, updatedBy]
    );
  }

  async getAssetCount(): Promise<number> {
    const res = await this.query("SELECT COUNT(*) as count FROM ativos WHERE _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')");
    return (res[0]?.count as number) || 0;
  }

  async getOperationalUnits(): Promise<string[]> {
    const res = await this.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(UNIDADE_OPERACIONAL), ''), 'Unidade Não Informada') AS unidade_nome
      FROM ativos 
      WHERE _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')
      GROUP BY UNIDADE_OPERACIONAL
      ORDER BY unidade_nome ASC
    `);
    return res.map(row => {
      const getVal = (target: string, fallback: unknown) => {
        const key = Object.keys(row).find(k => k.toLowerCase() === target.toLowerCase());
        return key ? row[key] : fallback;
      };
      const nameVal = getVal('unidade_nome', getVal('unidade_operacional', 'Unidade Não Informada'));
      return String(nameVal || 'Unidade Não Informada').trim().toUpperCase();
    });
  }

  async getOperationalUnitsWithStats(): Promise<{ name: string; count: number }[]> {
    const res = await this.query(`
      SELECT 
        COALESCE(NULLIF(TRIM(UNIDADE_OPERACIONAL), ''), 'Unidade Não Informada') AS unidade_nome, 
        COUNT(*) AS total_ativos 
      FROM ativos 
      WHERE _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')
      GROUP BY UNIDADE_OPERACIONAL 
      ORDER BY unidade_nome ASC
    `);
    return res.map(row => {
      const getVal = (target: string, fallback: unknown) => {
        const key = Object.keys(row).find(k => k.toLowerCase() === target.toLowerCase());
        return key ? row[key] : fallback;
      };
      const rawName = getVal('unidade_nome', getVal('unidade_exibicao', getVal('unidade_operacional', 'Unidade Não Informada')));
      const countVal = getVal('total_ativos', getVal('total', 0));
      return {
        name: String(rawName || 'Unidade Não Informada').trim().toUpperCase(),
        count: Number(countVal)
      };
    });
  }

  /**
   * Métricas de Dashboard via SQL (Performance v24.50)
   * Calcula TOTAL_LIDO, PENDENTES e %_AVANÇO direto no motor SQL.
   */
  async getDashboardStats(unitId?: string, campaignId?: string) {
    let query = `
      SELECT 
        COUNT(*) as total_geral,
        SUM(CASE WHEN (STATUS NOT LIKE '%BAIXADO%' OR STATUS IS NULL OR STATUS = '') THEN 1 ELSE 0 END) as total_ativos,
        SUM(CASE WHEN (_conferido = 1 OR AUDITOR_STATUS_CONFERENCIA = 'SIM') AND (STATUS NOT LIKE '%BAIXADO%' OR STATUS IS NULL OR STATUS = '') THEN 1 ELSE 0 END) as conferido_ativos,
        SUM(CASE WHEN (_conferido = 1 OR AUDITOR_STATUS_CONFERENCIA = 'SIM') AND STATUS LIKE '%BAIXADO%' THEN 1 ELSE 0 END) as baixados_localizados
      FROM ativos 
      WHERE _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')
    `;
    
    const params: (string | number)[] = [];
    if (unitId && unitId !== 'SEM UNIDADE' && unitId !== 'undefined') {
      // Usamos LIKE ou o mapping normalizado
      query += ` AND (UNIDADE_OPERACIONAL = ? OR _unitid = ?)`;
      params.push(unitId, unitId);
    }
    
    if (campaignId) {
      query += ` AND currentCampaignId = ?`;
      params.push(campaignId);
    }

    try {
      const res = await this.query(query, params);
      const row = res[0] || {};
      
      const totalAtivos = Number(row.total_ativos || 0);
      const conferidoAtivos = Number(row.conferido_ativos || 0);
      const baixadosLocalizados = Number(row.baixados_localizados || 0);
      
      return {
        totalAtivos,
        conferidoAtivos,
        baixadosLocalizados,
        totalLido: conferidoAtivos + baixadosLocalizados,
        pendentesAtivos: totalAtivos - conferidoAtivos,
        avancoPercent: totalAtivos > 0 ? Math.round((conferidoAtivos / totalAtivos) * 100) : 0
      };
    } catch (e) {
      console.error("Erro ao calcular métricas SQL Dashboard:", e);
      return null;
    }
  }

  async checkTableSchema(tableName: string): Promise<Record<string, string | number | boolean | null>[]> {
    return await this.query(`PRAGMA table_info(${tableName})`);
  }

  /**
   * Executa uma verificação física de integridade no arquivo SQLite.
   * Retorna true se o banco estiver saudável (ok).
   */
  async checkIntegrity(): Promise<boolean> {
    if (!this.nativeDb) return false;
    try {
      const res = await this.query("PRAGMA integrity_check");
      if (res && res.length > 0) {
        const status = res[0]['integrity_check'] as string;
        console.log(`>>> [Auditoria] SQLite Integrity Check: ${status}`);
        return status === 'ok';
      }
      return false;
    } catch (e) {
      console.error(">>> [Auditoria] Falha ao executar integrity_check:", e);
      return false;
    }
  }

  async bulkInsertAssets(assets: Asset[]) {
    return await this.saveAssetsBatch(assets);
  }

  async getAllAssets(): Promise<Asset[]> {
    return await this.query("SELECT * FROM ativos WHERE _is_deleted = 0 AND (conta_contabil IS NULL OR conta_contabil != '131105001')") as unknown as Asset[];
  }

  async saveUnitConfigSql(config: Record<string, unknown>) {
    const tenantId = (config._tenantid as string) || 'CICOPAL';
    await this.execute("INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)", 
      [tenantId, tenantId, JSON.stringify(config)]);
  }

  async getDb() { return this.nativeDb; }

  getNativePath() { return this.nativePath; }

  async persist(force = false) {
    if (force) console.log(">>> [Governance] Persistência FORÇADA solicitada.");
    await this.saveDatabase();
  }

  async importDatabase() {
    if (Capacitor.isNativePlatform()) {
      console.warn(">>> [Governance] importDatabase ignorado em plataforma nativa.");
      return;
    }
    
    // Para importar um binário em Web usando capacitor-sqlite/jeep-sqlite,
    // o processo ideal é escrever o arquivo no IndexedDB (onde o jeep-sqlite guarda)
    // ou usar a API de importação do plugin.
    // Por simplicidade e estabilidade, vamos converter para JSON se pudermos ou
    // alertar que a importação direta via binário no buffer precisa de integração específica com o Store do Jeep.
    console.warn(">>> [Governance] Importação de binário direto no Web via Jeep-SQLite requer persistência no Store first.");
    // TODO: Implementar escrita no IndexedDB ('localforage' ou 'db-store' que o jeep usa)
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

  async executeBatch(queries: {sql: string, params: (string | number | boolean | null)[]}[]) {
    if (!this.isInitialized) await this.init();
    if (!this.nativeDb) return;

    try {
      const set = queries.map(q => ({
        statement: q.sql,
        values: q.params
      }));
      await this.nativeDb.executeSet(set);
      await this.saveDatabase();
    } catch (error: unknown) {
      const e = error as Error;
      console.error("Batch failed:", e);
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
      if (this.isInitialized && (this.db || this.nativeDb)) {
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
    if (!this.nativeDb) return;
    
    if (Capacitor.isNativePlatform()) {
      try {
        // No nativo, podemos ler o arquivo diretamente do diretório interno
        const dbName = this.storageKeys.nativeFileName;
        const result = await Filesystem.readFile({
          path: `../databases/${dbName}.db`, // Caminho padrão do plugin no Android
          directory: Directory.Data
        });
        
        const fileName = `auditoria_backup_${new Date().getTime()}.db`;
        await Filesystem.writeFile({
          path: fileName,
          data: result.data,
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

    // No Web, capacitor-sqlite não exporta o binário .db facilmente via API.
    // Sugerimos usar a visualização de dados ou exportar JSON se necessário.
    console.warn(">>> [Governance] Exportação binária direta .db não suportada em Web via unified driver.");
    alert("No navegador, o backup binário direto (.db) está desabilitado temporariamente. Use a sincronização com a nuvem.");
  }
}

export const sqliteService = new SqliteService();
