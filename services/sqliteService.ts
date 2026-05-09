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
    DESCRICAODOBEM TEXT,
    MARCA TEXT,
    MODELO TEXT,
    STATUS TEXT,
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
    _history TEXT,
    _camposAlterados TEXT,
    _valoresOriginais TEXT,
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
    _origemTransacao TEXT,
    _gps_accuracy REAL,
    _ocr_verified INTEGER DEFAULT 0,
    _altitude_level INTEGER DEFAULT 0,
    _pos_timestamp TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    email TEXT,
    profile TEXT,
    role TEXT,
    is_certified INTEGER DEFAULT 0,
    _tenantid TEXT,
    _unitid TEXT,
    isAdmin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS AUDIT_LOG (
    id TEXT PRIMARY KEY,
    timestamp TEXT,
    user_email TEXT,
    action TEXT,
    details TEXT,
    _tenantid TEXT,
    _unitid TEXT
);

CREATE TABLE IF NOT EXISTS session_tokens (
    unit_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets (ETIQUETA);
CREATE INDEX IF NOT EXISTS idx_assets_registro ON assets (REGISTRO);
CREATE INDEX IF NOT EXISTS idx_assets_serial ON assets (SERIAL);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta_unit ON assets (ETIQUETA, UNIDADE_OPERACIONAL);
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta_unitid ON assets (ETIQUETA, _unitid);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (TAG_INVENTARIO);
CREATE INDEX IF NOT EXISTS idx_assets_endereco ON assets (ENDERECO);
CREATE INDEX IF NOT EXISTS idx_ativos_endereco ON assets (ENDERECO);
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

CREATE TABLE IF NOT EXISTS unit_configs (
    id TEXT PRIMARY KEY,
    unit_id TEXT,
    tenant_id TEXT,
    _unitid TEXT,
    _tenantid TEXT,
    lat REAL,
    lng REAL,
    radius_meters INTEGER,
    is_active INTEGER,
    updated_by TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS config_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
);
`;

export type StorageSource = 'PHYSICAL' | 'CACHE' | 'MEMORY' | 'NONE';

export interface FileStatus {
  status: string;
  fileName: string | null;
  path: string;
  source: StorageSource;
  handle?: FileSystemFileHandle;
}

class SqliteService {
  private db: Database | null = null;
  private isInitialized = false;
  private storageSource: StorageSource = 'NONE';
  private lastDiscWrite: string | null = null;
  private currentDbStatus: DatabaseStatus = DatabaseStatus.EMPTY;
  private activeFileHandle: FileSystemFileHandle | null = null;
  private permissionGrantedSession = false;
  private activeSchemaMappings: Record<string, string> = {};
  private lastError: string | null = null;
  
  public onStatusChange: ((status: FileStatus) => void) | null = null;
  
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
      try { 
        this.db.close(); 
        console.log(">>> [SafeRecovery] Conexão ativa encerrada com sucesso.");
      } catch (e) { 
        console.warn(">>> [SafeRecovery] Falha ao encerrar conexão órfã:", e); 
      }
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
  getLastError() { return this.lastError; }

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
        path: `Directory.Data/${this.storageKeys.nativeFileName}`,
        source: 'PHYSICAL'
      };
    }
    
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
      if (!handle) return { status: 'none', fileName: null, path: '', source: this.storageSource };
      
      let currentPerm = 'prompt';
      if (this.permissionGrantedSession && this.activeFileHandle) {
        currentPerm = 'granted';
      } else {
        // @ts-expect-error mode property is experimental
        currentPerm = await handle.queryPermission({ mode: 'readwrite' });
      }

      if (currentPerm === 'granted') {
        this.permissionGrantedSession = true;
        this.activeFileHandle = handle;
      }

      return { 
        status: currentPerm as string, 
        fileName: handle.name, 
        path: handle.name, 
        handle,
        source: handle ? 'PHYSICAL' : this.storageSource
      };
    } catch {
      return { status: 'error', fileName: null, path: '', source: this.storageSource };
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

  /**
   * Mantém a integridade do banco de dados local entre atualizações de versão
   * v2.7: Garante colunas de auditoria soberana (_history, _camposAlterados, etc)
   */
  public async ensureRequiredColumns() {
    if (!this.db) return;
    const tables = ['assets', 'campaigns', 'users', 'unit_configs'];
    
    for (const table of tables) {
      const res = this.db.exec(`PRAGMA table_info(${table})`);
      if (res && res.length > 0) {
        const columns = res[0].values.map(v => v[1] as string);
        
        if (table === 'campaigns') {
          const campCols = ['tenant_id', 'unit_id', '_tenantid', '_unitid'];
          for (const col of campCols) {
            if (!columns.includes(col)) {
              this.db.run(`ALTER TABLE campaigns ADD COLUMN ${col} TEXT`);
            }
          }
        }
        
        if (table === 'assets') {
          for (const col of DB_ASSET_COLUMNS) {
            if (!columns.includes(col)) {
              let type = 'TEXT';
              if (col.startsWith('_is') || ['_version', '_conferido', '_plaquetado', '_aprovado', '_ocr_verified', 'Sn1_recno', 'Sn3_recno', '_altitude_level', 'isAdmin'].includes(col)) {
                type = 'INTEGER DEFAULT 0';
              } else if (['_lat', '_lng', '_gps_accuracy', 'VLRAQUISIC'].includes(col)) {
                type = 'REAL';
              }
              
              try {
                this.db.run(`ALTER TABLE assets ADD COLUMN ${col} ${type}`);
                console.log(`>>> [SchemaFix] Coluna ${col} adicionada à tabela assets.`);
              } catch (err) {
                console.error(`>>> [SchemaFix] Falha ao adicionar coluna ${col}:`, err);
              }
              
              // Migrações de Legado
              if (col === 'DESCRICAODOATIVO' && columns.includes('DESCRICAODOBEM')) {
                this.db.run("UPDATE assets SET DESCRICAODOATIVO = DESCRICAODOBEM WHERE DESCRICAODOATIVO IS NULL");
              }
            }
          }
          
          // Garantir valores padrão
          this.db.run("UPDATE assets SET _version = 1 WHERE _version IS NULL");
          this.db.run("UPDATE assets SET _is_deleted = 0 WHERE _is_deleted IS NULL");
          this.db.run("UPDATE assets SET _is_synced = 0 WHERE _is_synced IS NULL");
        }

        if (table === 'users') {
          if (!columns.includes('role')) this.db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'");
          if (!columns.includes('isAdmin')) this.db.run("ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0");
        }
      }
    }
  }

  /**
   * Importação Soberana: Recebe um Uint8Array e injeta no motor SQL
   * No Nativo, força a gravação no diretório físico interno antes de abrir.
   */
  async importDatabase(bytes: Uint8Array) {
    if (!bytes || bytes.length === 0) throw new Error("Binário de entrada vazio.");
    
    console.log(`>>> [Governance] Importando base externa: ${bytes.length} bytes.`);
    
    // 1. Persistência Física Pré-Inicialização (Soberania de Acesso)
    if (Capacitor.isNativePlatform()) {
      try {
        // Conversão otimizada via pedaços para evitar estouro de pilha e lentidão
        const CHUNK_SIZE = 0x8000; // 32768
        let binary = "";
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
          const chunk = bytes.subarray(i, i + CHUNK_SIZE);
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        const base64Data = btoa(binary);

        // Garante que o diretório existe (Data directory)
        await Filesystem.writeFile({
          path: this.storageKeys.nativeFileName,
          data: base64Data,
          directory: Directory.Data
        });
        console.log(`>>> [NativeBridge] Snapshot físico COPY para Directory.Data concluído.`);
      } catch {
        console.error(">>> [NativeBridge] Erro ao gravar snapshot físico.");
      }
    }

    // 2. Persistência em Cache
    await localforage.setItem(this.storageKeys.dbKey, bytes);
    
    // 3. Inicialização e Descoberta de Schema
    const success = await this.init(true);
    
    if (success && this.db) {
      await this.discoverAndMapData();
      this.currentDbStatus = DatabaseStatus.LOADED;
      await this.setSystemStatus(DatabaseStatus.LOADED);
      await this.saveDatabase();
    }
    
    return success;
  }

  /**
   * Tenta encontrar dados em tabelas com nomes variados e normalizar para 'assets'
   */
  private async discoverAndMapData() {
    if (!this.db) return;
    
    const possibleTableNames = ['SN1', 'SN3', 'BENS', 'ATIVOS', 'TB_ATIVOS', 'TB_BENS', 'Z_ATIVOS', 'SB1'];
    const tablesRes = this.db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!tablesRes || tablesRes.length === 0) return;
    
    const existingTables = tablesRes[0].values.map(v => (v[0] as string).toUpperCase());
    
    // Verifica se a tabela principal existe e se possui dados
    let assetsHasData = false;
    try {
      const countRes = this.db.exec("SELECT COUNT(*) FROM assets");
      if (countRes && countRes[0] && countRes[0].values[0]) {
        assetsHasData = Number(countRes[0].values[0][0]) > 0;
      }
    } catch {
      assetsHasData = false;
    }
    
    if (!assetsHasData) {
      const sourceTable = possibleTableNames.find(name => existingTables.includes(name));
      if (sourceTable) {
        console.log(`>>> [SchemaDiscovery] Migrando dados da tabela legacy ${sourceTable} para assets.`);
        try {
          // Se já existia uma tabela 'assets' vazia, removemos para recriar com os dados
          this.db.run("DROP TABLE IF EXISTS assets");
          this.db.run(`CREATE TABLE assets AS SELECT * FROM ${sourceTable}`);
          console.log(`>>> [SchemaDiscovery] Tabela ${sourceTable} normalizada com sucesso.`);
        } catch (err) {
          console.error(`>>> [SchemaDiscovery] Erro ao migrar ${sourceTable}:`, err);
        }
      }
    }
    
    // Sanitização de IDs vazios ou nulos (Essencial para Offline-First)
    try {
      // Garante que pelo menos as tabelas básicas existam após a descoberta
      this.db.run(FULL_SCHEMA);
      this.db.run("UPDATE assets SET id = ETIQUETA WHERE id IS NULL OR id = ''");
      this.db.run("UPDATE assets SET id = 'temp_' || hex(randomblob(4)) WHERE id IS NULL OR id = ''");
    } catch { /* ignore */ }
  }

  async init(force = false) {
    if (this.isInitialized && this.db && !force) return true;
    
    this.lastError = null;
    if (force) await this.reset();
    
    try {
      console.log(">>> [Init] Iniciando motor SQL.js...");
      const SQL = await initSqlJs({ 
        locateFile: (file: string) => `./${file}` 
      });
      
      let bytes: Uint8Array | null = null;

      // PRIORIDADE 0: PERSISTÊNCIA NATIVA (CAPACITOR / ANDROID)
      if (Capacitor.isNativePlatform()) {
        try {
          console.log(`>>> [NativeBridge] Verificando existência de ${this.storageKeys.nativeFileName} em Directory.Data...`);
          const result = await Filesystem.readFile({
            path: this.storageKeys.nativeFileName,
            directory: Directory.Data
          });
          
          if (result.data) {
            const binaryString = atob(result.data as string);
            bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            console.log(`>>> [NativeBridge] Banco NATIVO lido com sucesso (${bytes.length} bytes).`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.warn(`>>> [NativeBridge] Arquivo nativo ausente ou ilegível: ${errorMsg}`);
          if (errorMsg.includes("corrupt") || errorMsg.includes("Sqlite")) {
             this.lastError = `SQLite Error: ${errorMsg}`;
          }
        }
      }

      // PRIORIDADE 1: FILE HANDLE (WEB/MOBILE ACCESS API)
      if (!bytes) {
        const handle = this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.storageKeys.fileHandleKey);
        if (handle) {
          try {
            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
              const file = await handle.getFile();
              const buffer = await file.arrayBuffer();
              bytes = new Uint8Array(buffer);
              this.activeFileHandle = handle;
              this.permissionGrantedSession = true;
              console.log(`>>> [Persistence] Banco FÍSICO carregado (${bytes.length} bytes).`);
            }
          } catch { console.warn(">>> [Persistence] Falha ao ler FileHandle."); }
        }
      }

      // PRIORIDADE 2: CACHE LOCALFORAGE
      if (!bytes) {
        const binary = await localforage.getItem<Uint8Array>(this.storageKeys.dbKey);
        if (binary && binary.length > 4096) {
          bytes = binary;
          console.log(`>>> [Persistence] Banco em CACHE carregado (${bytes.length} bytes).`);
        }
      }

      // Inicialização do Banco
      try {
        if (bytes && bytes.length > 0) {
          this.db = new SQL.Database(bytes);
          this.storageSource = 'PHYSICAL'; // No nativo e handle, consideramos físico
          console.log(`>>> [Persistence] Banco montado via ${this.storageSource}.`);
        } else {
          console.log(">>> [Persistence] Nenhuma base existente encontrada. Iniciando MEMORY MODE.");
          this.db = new SQL.Database();
          this.storageSource = 'MEMORY';
        }
      } catch (dbErr) {
        console.error(">>> [Persistence] Erro ao instanciar banco (possível corrupção):", dbErr);
        this.lastError = `Corrupção detectada: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`;
        // Fallback para memória se o arquivo estiver corrompido
        this.db = new SQL.Database();
        this.storageSource = 'MEMORY';
        console.warn(">>> [Persistence] Retornando para MEMORY MODE devido a erro no carregamento.");
      }

      // Aplicação de Schema e Migrações APÓS carga de dados
      this.db.run(FULL_SCHEMA);
      await this.ensureRequiredColumns();
      await this.detectAndPersistSchema();
      
      this.isInitialized = true;

      // Atualiza Path Nativo para Admin
      if (Capacitor.isNativePlatform()) {
        try {
          const uriResult = await Filesystem.getUri({ path: this.storageKeys.nativeFileName, directory: Directory.Data });
          this.nativePath = uriResult.uri;
        } catch {
          this.nativePath = `Directory.Data/${this.storageKeys.nativeFileName}`;
        }
      }

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      console.error(">>> [FATAL] Init SQLite failed:", err);
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
          // Conversão otimizada via pedaços
          const CHUNK_SIZE = 0x8000;
          let binary = "";
          const bytesToConv = new Uint8Array(data);
          for (let i = 0; i < bytesToConv.length; i += CHUNK_SIZE) {
            const chunk = bytesToConv.subarray(i, i + CHUNK_SIZE);
            binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
          }
          const base64Data = btoa(binary);

          await Filesystem.writeFile({
            path: this.storageKeys.nativeFileName,
            data: base64Data,
            directory: Directory.Data
          });
          
          this.lastDiscWrite = new Date().toLocaleTimeString('pt-BR');
          
          try {
            const uriResult = await Filesystem.getUri({
              path: this.storageKeys.nativeFileName,
              directory: Directory.Data
            });
            this.nativePath = uriResult.uri;
          } catch {
            this.nativePath = `${Directory.Data}/${this.storageKeys.nativeFileName}`;
          }

          console.log(`>>> [NativeBridge] SINCRO NATIVA: Sucesso.`);
          const user = JSON.parse(localStorage.getItem('app_current_user') || '{}');
          if (user.isAdmin || user.role === 'ADMIN' || user.email === 'semorr@gmail.com') {
            console.log(`[AdminPath] Sync Target: ${this.nativePath}`);
          }
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

  async run(sql: string, params: (string | number | boolean | null)[] = []) {
    return await this.execute(sql, params);
  }

  private parseAsset(raw: Record<string, unknown>): Asset {
    if (!raw) return raw as unknown as Asset;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asset = { ...raw } as any;
    
    // Booleans (Integers in SQLite)
    const boolFields = [
      '_conferido', '_isNew', '_is_deleted', '_is_synced', 
      '_plaquetado', '_aprovado', '_is_unitized', 
      '_is_divergent_baixa', '_ocr_verified'
    ];
    
    boolFields.forEach(key => {
      if (asset[key] !== undefined && asset[key] !== null) {
        asset[key] = asset[key] === 1 || asset[key] === '1' || asset[key] === true;
      }
    });

    // JSON Arrays/Objects
    const jsonFields = ['_history', '_camposAlterados', '_valoresOriginais', '_baseSinteticaLoc'];
    jsonFields.forEach(key => {
      if (typeof asset[key] === 'string' && asset[key].trim().length > 0) {
        try {
          const firstChar = asset[key].trim()[0];
          if (firstChar === '[' || firstChar === '{') {
            asset[key] = JSON.parse(asset[key]);
          }
        } catch (e) {
          console.warn(`>>> [AssetParser] Falha ao parsear campo ${key}:`, e);
        }
      }
    });

    return asset as Asset;
  }

  // --- Ativos ---
  async getAssets(tenantId: string, unitId?: string | null): Promise<Asset[]> {
    let sql = "SELECT * FROM assets WHERE (_tenantid = ? OR GRUPO_EMPRESARIAL = ?) AND _is_deleted = 0";
    const params: (string | number | boolean | null)[] = [tenantId, tenantId];
    if (unitId) {
      sql += " AND (_unitid = ? OR UNIDADE_OPERACIONAL = ?)";
      params.push(unitId, unitId);
    }
    const rows = await this.query(sql, params);
    return (rows || []).map(row => this.parseAsset(row));
  }

  private serializeValue(val: unknown): string | number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val as string | number;
  }

  async saveAsset(asset: Asset) {
    const validKeys = Object.keys(asset).filter(k => DB_ASSET_COLUMNS.includes(k));
    const cols = validKeys.join(', ');
    const placeholders = validKeys.map(() => '?').join(', ');
    const values = validKeys.map(k => this.serializeValue(asset[k as keyof Asset]));
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
        const values = validKeys.map(k => this.serializeValue(asset[k as keyof Asset]));
        this.db.run(`INSERT OR REPLACE INTO assets (${cols}) VALUES (${placeholders})`, values);
      }
      this.db.run("COMMIT");
      await this.saveDatabase();
    } catch (e) {
      console.error(">>> [DATABASE] Falha Crítica no Lote:", e);
      if (this.db) {
        try { this.db.run("ROLLBACK"); } catch { /* ignore */ }
      }
      throw e;
    }
  }

  async deleteAsset(id: string) {
    await this.execute("UPDATE assets SET _is_deleted = 1 WHERE id = ?", [id]);
  }

  // --- Campanhas (Refactor v2.6.5) ---
  private normalizeCampaign(row: Record<string, string | number | boolean | null>): InventoryCampaign {
    if (!row) return row as unknown as InventoryCampaign;
    return {
      ...row,
      id: String(row.id),
      unit_id: (String(row.unit_id || row._unitid || '')).trim(),
      _unitid: (String(row.unit_id || row._unitid || '')).trim(),
      tenant_id: (String(row.tenant_id || row._tenantid || '')).trim(),
      _tenantid: (String(row.tenant_id || row._tenantid || '')).trim(),
      tenantId: (String(row.tenant_id || row._tenantid || '')).trim(),
      status: (row.status as string) || 'CREATED'
    } as unknown as InventoryCampaign;
  }

  async getCampaigns(tenantId: string, unitId?: string | null): Promise<InventoryCampaign[]> {
    console.log(`>>> [Governance] SQL Query Campaigns: Tenant=${tenantId}, Unit=${unitId || 'ALL'}`);
    let sql = "SELECT * FROM campaigns WHERE (tenant_id = ? OR _tenantid = ?)";
    const params: (string | number | boolean | null)[] = [tenantId, tenantId];
    
    if (unitId) {
      sql += " AND (unit_id = ? OR _unitid = ?)";
      params.push(unitId, unitId);
    }

    const rows = await this.query(sql, params);
    return (rows || []).map(row => this.normalizeCampaign(row));
  }

  async saveCampaign(campaign: InventoryCampaign): Promise<InventoryCampaign> {
    const payload = {
      id: campaign.id || `local_${Date.now()}`,
      name: campaign.name || 'Nova Campanha',
      description: campaign.description || '',
      status: campaign.status || 'CREATED',
      start_date: campaign.start_date || new Date().toISOString(),
      end_date: campaign.end_date || null,
      tenant_id: (campaign.tenant_id || campaign._tenantid || 'CICOPAL').trim(),
      unit_id: (campaign.unit_id || campaign._unitid || '').trim()
    };
    
    const validKeys = Object.keys(payload);
    const cols = validKeys.join(', ');
    const placeholders = validKeys.map(() => '?').join(', ');
    const values = validKeys.map(k => payload[k as keyof typeof payload]);
    
    await this.execute(`INSERT OR REPLACE INTO campaigns (${cols}) VALUES (${placeholders})`, values);
    return this.normalizeCampaign(payload as unknown as Record<string, string | number | boolean | null>);
  }

  async deleteCampaignSql(id: string) {
    await this.execute("DELETE FROM campaigns WHERE id = ?", [id]);
    await this.execute("UPDATE assets SET _campaignId = NULL WHERE _campaignId = ?", [id]);
    await this.saveDatabase();
  }

  // --- Configurações de Unidade (GPS) ---
  private normalizeUnitConfig(row: Record<string, string | number | boolean | null>): UnitConfig {
    return {
      ...row,
      unit_id: String(row.unit_id || row._unitid || ''),
      _unitid: String(row.unit_id || row._unitid || ''),
      tenant_id: String(row.tenant_id || row._tenantid || ''),
      _tenantid: String(row.tenant_id || row._tenantid || ''),
      lat: Number(row.lat) || 0,
      lng: Number(row.lng) || 0,
      radius_meters: Number(row.radius_meters) || 500,
      is_active: Boolean(row.is_active)
    } as unknown as UnitConfig;
  }

  async getUnitConfigs(tenantId: string): Promise<UnitConfig[]> {
    const rows = await this.query("SELECT * FROM unit_configs WHERE (tenant_id = ? OR _tenantid = ?)", [tenantId, tenantId]);
    return (rows || []).map(row => this.normalizeUnitConfig(row));
  }

  async saveUnitConfig(config: UnitConfig): Promise<void> {
    const payload = {
      id: config.id || `${config.tenant_id}_${config.unit_id}`,
      unit_id: config.unit_id || config._unitid,
      tenant_id: config.tenant_id || config._tenantid,
      lat: config.lat,
      lng: config.lng,
      radius_meters: config.radius_meters || 500,
      is_active: config.is_active ?? true,
      updated_by: config.updated_by || 'system',
      updated_at: new Date().toISOString(),
      _tenantid: config.tenant_id || config._tenantid,
      _unitid: config.unit_id || config._unitid
    };

    const keys = Object.keys(payload);
    const cols = keys.join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(payload);

    await this.execute(`INSERT OR REPLACE INTO unit_configs (${cols}) VALUES (${placeholders})`, values);
    console.log(`>>> [SQLite] Config de GPS para ${payload.unit_id} salva.`);
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
    const rows = await this.query("SELECT * FROM assets WHERE _is_deleted = 0");
    return (rows || []).map(row => this.parseAsset(row));
  }

  async saveUnitConfigSql(config: Record<string, unknown>) {
    const tenantId = (config._tenantid as string) || 'CICOPAL';
    await this.execute("INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)", 
      [tenantId, tenantId, JSON.stringify(config)]);
  }

  async getDb() { return this.db; }

  async saveConfig(key: string, value: string) {
    await this.execute("INSERT OR REPLACE INTO config_meta (key, value, updated_at) VALUES (?, ?, ?)", 
      [key, value, new Date().toISOString()]);
  }

  async getConfig(key: string): Promise<string | null> {
    const res = await this.query("SELECT value FROM config_meta WHERE key = ?", [key]);
    return (res[0]?.value as string) || null;
  }

  getNativePath() { return this.nativePath; }

  async persist(force = false) {
    if (force) console.log(">>> [Governance] Persistência FORÇADA solicitada.");
    await this.saveDatabase();
  }

  async vacuum() {
    if (!this.db) return;
    try {
      this.db.run("VACUUM");
      console.log(">>> [Persistence] VACUUM executado com sucesso.");
    } catch (err) {
      console.error(">>> [Persistence] Erro ao executar VACUUM:", err);
    }
  }

  async logAuditEvent(entry: { user_email: string, action: string, details: string, _tenantid?: string, _unitid?: string }) {
    const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    await this.execute(
      "INSERT INTO AUDIT_LOG (id, timestamp, user_email, action, details, _tenantid, _unitid) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, timestamp, entry.user_email, entry.action, entry.details, entry._tenantid || 'GLOBAL', entry._unitid || '']
    );
    console.log(`>>> [LocalAudit] Evento registrado: ${entry.action} para ${entry.user_email}`);
  }

  async localAuth(username: string, password_plain: string): Promise<User | null> {
    // REGRA DE OURO: Fallback para Administrador Mestre (Soberania de Acesso)
    if (username.trim().toLowerCase() === 'semorr@gmail.com' && password_plain === 'Glaucio@1970') {
      return {
        id: 'MASTER-ADMIN',
        username: 'semorr',
        email: 'semorr@gmail.com',
        role: 'ADMIN' as UserRole,
        isAdmin: true,
        _tenantid: 'MASTER',
        _unitid: 'MASTER'
      };
    }

    // Em um sistema 100% offline, as credenciais residem no banco físico.
    // Hash de senha deve ser implementado no futuro se necessário.
    const rows = await this.query("SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?", [username, username, password_plain]);
    if (rows && rows.length > 0) {
      const u = rows[0];
      return {
        id: u.id as string,
        username: u.username as string,
        email: u.email as string,
        role: (u.role as UserRole) || (u.isAdmin ? 'ADMIN' as UserRole : 'USER' as UserRole),
        isAdmin: !!u.isAdmin,
        _tenantid: u._tenantid as string,
        _unitid: u._unitid as string
      };
    }
    return null;
  }

  // --- File Link Methods ---
  async linkFile(handle?: FileSystemFileHandle): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      // No nativo, se não há handle, o usuário quer vincular um arquivo externo
      // como não temos showOpenFilePicker, vamos alertar ou delegar
      console.log(">>> [NativeBridge] Tentativa de vínculo externo detectada.");
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
          types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3', '.sql'] } }],
        });
        targetHandle = picked;
      } catch (err) { 
        console.warn("User cancelled or picker failed", err);
        return false; 
      }
    }
    
    if (!targetHandle) return false;
    
    this.activeFileHandle = targetHandle;
    await localforage.setItem(this.storageKeys.fileHandleKey, targetHandle);
    this.permissionGrantedSession = true;
    await this.init(true);
    if (this.onStatusChange) this.onStatusChange(await this.getFileStatus());
    return true;
  }

  async unlinkExternalFile() {
    await localforage.removeItem(this.storageKeys.fileHandleKey);
    this.activeFileHandle = null;
    this.permissionGrantedSession = false;
    await this.init(true);
    if (this.onStatusChange) this.onStatusChange(await this.getFileStatus());
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
      const success = await this.init(true); // Inicializa novo banco em memória
      await this.saveDatabase(); // Persiste no sistema de arquivos nativo
      if (success) {
        alert("Novo Banco de Dados Local criado automaticamente com sucesso!");
      }
      return success;
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

  // Remove redundant campaign methods
  async deleteCampaign(id: string): Promise<void> {
    await this.run("DELETE FROM campaigns WHERE id = ?", [id]);
    await this.saveDatabase();
  }

  async updateCampaignStatus(id: string, status: string, userEmail?: string): Promise<boolean> {
    try {
      await this.run("UPDATE campaigns SET status = ? WHERE id = ?", [status, id]);
      if (userEmail) {
        await this.logAuditEvent({
          action: `UPDATE_CAMPAIGN_STATUS: ${status}`,
          details: `Campanha ID: ${id}`,
          user: userEmail
        });
      }
      await this.saveDatabase();
      return true;
    } catch (err) {
      console.error(">>> [SQLite] Erro ao atualizar status da campanha:", err);
      return false;
    }
  }

  async fetchCampaignStats(campaignId: string, tenantId: string) {
    try {
      const res = await this.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN _conferido = 1 THEN 1 ELSE 0 END) as inventoried,
          SUM(CASE WHEN TAG_INVENTARIO = 'DIVERGÊNCIA' THEN 1 ELSE 0 END) as divergences
        FROM assets 
        WHERE _campaignId = ? AND (_tenantid = ? OR GRUPO_EMPRESARIAL = ?)
      `, [campaignId, tenantId, tenantId]);

      if (res.length > 0) {
        return {
          total: Number(res[0].total) || 0,
          inventoried: Number(res[0].inventoried) || 0,
          divergences: Number(res[0].divergences) || 0
        };
      }
      return { total: 0, inventoried: 0, divergences: 0 };
    } catch (err) {
      console.error(">>> [SQLite] Erro ao buscar stats da campanha:", err);
      return { total: 0, inventoried: 0, divergences: 0 };
    }
  }

  async createCampaignSnapshot(campaignId: string, closedBy: string): Promise<boolean> {
    try {
      const assets = await this.query("SELECT * FROM assets WHERE _campaignId = ?", [campaignId]);
      const assetsJson = JSON.stringify(assets);
      const snapshotId = `snap_${campaignId}_${new Date().getTime()}`;
      
      const config = await this.getInventoryConfig();
      const metadata = JSON.stringify(config || {});

      await this.run(`
        INSERT INTO campaign_snapshots (id, campaign_id, assets_data, metadata, closed_at, closed_by, _tenantid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        snapshotId, 
        campaignId, 
        assetsJson, 
        metadata, 
        new Date().toISOString(), 
        closedBy,
        config?._tenantid || 'CICOPAL'
      ]);
      await this.saveDatabase();
      return true;
    } catch (err) {
      console.error(">>> [SQLite] Erro ao criar snapshot da campanha:", err);
      return false;
    }
  }

  async getCampaignSnapshot(campaignId: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await this.query("SELECT * FROM campaign_snapshots WHERE campaign_id = ? ORDER BY closed_at DESC LIMIT 1", [campaignId]);
      if (res.length > 0) {
        return {
          ...res[0],
          assets_data: JSON.parse(res[0].assets_data as string)
        };
      }
      return null;
    } catch (err) {
      console.error(">>> [SQLite] Erro ao obter snapshot:", err);
      return null;
    }
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

  getLastDiscWrite() { return this.lastDiscWrite; }

  /**
   * Exportação Soberana Nativa: Copia o arquivo interno para a pasta de Documentos
   */
  async exportPhysicalBackup() {
    if (!Capacitor.isNativePlatform()) {
      return this.downloadDatabase();
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `inventario_seguranca_${timestamp}.db`;
      
      await Filesystem.copy({
        from: this.storageKeys.nativeFileName,
        to: backupName,
        directory: Directory.Data,
        toDirectory: Directory.Documents
      });

      alert(`BACKUP REALIZADO: Cópia física exportada para Documentos.\nArquivo: ${backupName}`);
      return true;
    } catch (err) {
      console.error(">>> [BackupError] Falha na cópia física:", err);
      alert("Falha ao gerar cópia de segurança física.");
      return false;
    }
  }
}

export const sqliteService = new SqliteService();
