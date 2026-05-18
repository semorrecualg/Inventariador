import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Device } from '@capacitor/device';
import { SQLiteConnection, SQLiteDBConnection, CapacitorSQLite } from '@capacitor-community/sqlite';
import { DatabaseStatus, Asset, InventoryCampaign, InventoryState } from '../types';
import { SCHEMA_PRIORITY, findBestColumn } from '../utils/schema';
import { DB_ASSET_COLUMNS } from '../constants/schema';

const FULL_SCHEMA = `
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
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_audit_registro ON AUDIT_LOG(registro_id);

  CREATE TABLE IF NOT EXISTS ativos_imobilizados (
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
    id TEXT PRIMARY KEY,
    codigo_ativo TEXT,
    conta_contabil TEXT,
    _origemTransacao INTEGER DEFAULT 1000,
    _status_sinc INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_ativos_conta ON ativos_imobilizados (conta_contabil);
  CREATE INDEX IF NOT EXISTS idx_ativos_recno ON ativos_imobilizados (Sn1_recno, Sn3_recno);

  CREATE TABLE IF NOT EXISTS ativos (
    id TEXT PRIMARY KEY,
    ETIQUETA TEXT UNIQUE,
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
    timestamp_gravacao DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mestre_etiqueta ON ativos (ETIQUETA);
  CREATE INDEX IF NOT EXISTS idx_mestre_unit ON ativos (UNIDADE_OPERACIONAL);
  CREATE INDEX IF NOT EXISTS idx_mestre_unitid ON ativos (_unitid);
  CREATE INDEX IF NOT EXISTS idx_mestre_status ON ativos (TAG_INVENTARIO);
  CREATE INDEX IF NOT EXISTS idx_mestre_endereco ON ativos (ENDERECO);
  CREATE INDEX IF NOT EXISTS idx_mestre_localmaster ON ativos (_localMaster);

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
            'AUDITOR_STATUS_CONFERENCIA', '_origemTransacao'
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
      } else {
        await this.sqliteConnection.checkConnectionsConsistency();
      }

      // 2. Gerenciamento de Conexão Nativa Embutida
      const dbName = this.storageKeys.nativeFileName;
      const isConn = await this.sqliteConnection.isConnection(dbName, false);
      
      if (isConn.result) {
        this.nativeDb = await this.sqliteConnection.retrieveConnection(dbName, false);
      } else {
        this.nativeDb = await this.sqliteConnection.createConnection(dbName, false, "no-encryption", 1, false);
      }

      // 3. Abertura Física do Arquivo .db
      await this.nativeDb.open();
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
      const err = error as { message?: string };
      console.error(">>> [Database] Falha crítica no bootstrap do banco:", err);
      window.dispatchEvent(new CustomEvent('gbr_db_init_failed', { detail: { error: String(err) } }));
      throw new Error(`Bootstrap Falhou: ${err?.message || String(err)}`);
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

    // GBR v25 - Blindagem de Escrita Segura
    const isWrite = sql.toUpperCase().includes('INSERT') || sql.toUpperCase().includes('UPDATE') || sql.toUpperCase().includes('DELETE');
    if (isWrite && !this.permissionsGranted) {
       console.error(">>> [Governance] Gravação bloqueada por falta de permissões (Camera/GPS).");
       throw new Error("Acesso negado: O App exige permissões de Câmera e Localização para gravar dados.");
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
    let sql = "SELECT * FROM ativos WHERE (_tenantid = ? OR GRUPO_EMPRESARIAL = ?) AND _is_deleted = 0";
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
      const queries = assets.map(asset => {
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
    return await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tenantId]);
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
    const res = await this.query("SELECT COUNT(*) as count FROM ativos WHERE _is_deleted = 0");
    return (res[0]?.count as number) || 0;
  }

  async getOperationalUnits(): Promise<string[]> {
    const res = await this.query("SELECT DISTINCT UNIDADE_OPERACIONAL FROM ativos WHERE UNIDADE_OPERACIONAL IS NOT NULL AND UNIDADE_OPERACIONAL != ''");
    return res.map(row => row.UNIDADE_OPERACIONAL as string);
  }

  async checkTableSchema(tableName: string): Promise<Record<string, string | number | boolean | null>[]> {
    return await this.query(`PRAGMA table_info(${tableName})`);
  }

  async bulkInsertAssets(assets: Asset[]) {
    return await this.saveAssetsBatch(assets);
  }

  async getAllAssets(): Promise<Asset[]> {
    return await this.query("SELECT * FROM ativos WHERE _is_deleted = 0") as unknown as Asset[];
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
