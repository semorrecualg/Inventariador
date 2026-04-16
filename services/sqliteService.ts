
import localforage from 'localforage';
import initSqlJs, { Database, SqlValue } from 'sql.js';

localforage.config({
  name: 'GBR_SYSTEM_DB',
  storeName: 'sqlite_expert_file'
});

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
    DE_PARA TEXT,
    AUDITOR_STATUS_CONFERENCIA TEXT,
    _origemTransacao TEXT
);
CREATE TABLE IF NOT EXISTS unit_configs (
    unit_id TEXT PRIMARY KEY,
    tenant_id TEXT,
    config_data TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    user_email TEXT,
    action TEXT,
    details TEXT,
    _tenantid TEXT
);
`;

class SQLiteService {
  private db: Database | null = null;
  private isInitialized = false;
  private dbKey = 'gbr_expert_db_binary';
  private fileHandleKey = 'gbr_db_file_handle';

  /**
   * Verifica se o acesso ao arquivo físico está ativo e funcional
   */
  async getFileStatus() {
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.fileHandleKey);
      if (!handle) return { status: 'unlinked', path: 'Nenhum arquivo vinculado' };
      
      const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
      const permission = await handle.queryPermission(options);
      
      if (permission === 'granted') {
        const file = await handle.getFile();
        return { status: 'linked', path: file.name, lastModified: new Date(file.lastModified).toLocaleString() };
      }
      return { status: 'permission_denied', path: 'Acesso negado pelo navegador' };
    } catch {
      return { status: 'error', path: 'Erro ao verificar status' };
    }
  }

  /**
   * Solicita permissão de leitura/escrita para o arquivo já vinculado
   */
  async requestFilePermission() {
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.fileHandleKey);
      if (!handle) return false;

      const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
      const status = await handle.requestPermission(options);
      
      if (status === 'granted') {
        // Recarrega o banco com a nova permissão
        this.isInitialized = false;
        await this.init();
        return true;
      }
      return false;
    } catch (_err) {
      console.error(">>> [DBA] Erro ao solicitar permissão:", _err);
      return false;
    }
  }

  async init() {
    if (this.isInitialized) return;

    // 1. Tenta Persistência de Sistema (Quota Management)
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }

    const SQL = await initSqlJs({
      locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
    });

    // 2. Tenta Recuperar do Mapeador de Pasta Física (Solução Definitiva)
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.fileHandleKey);
      if (handle) {
        const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
        // Se a permissão for 'prompt', o navegador exige interação do usuário (não pode ser no init silencioso)
        if ((await handle.queryPermission(options)) === 'granted') {
          const file = await handle.getFile();
          const buffer = await file.arrayBuffer();
          console.log(`>>> [DBA] Carregando do Arquivo Físico IMOBILIZADO: ${file.name}`);
          this.db = new SQL.Database(new Uint8Array(buffer));
          this.isInitialized = true;
          return;
        } else {
           console.warn(">>> [DBA] Permissão pendente para arquivo físico. Usando cache IndexedDB temporariamente.");
        }
      }
    } catch {
      console.warn(">>> [DBA] Mapeador físico inativo. Tentando IndexedDB de segurança.");
    }

    const savedDb = await localforage.getItem<Uint8Array>(this.dbKey);
    this.db = savedDb ? new SQL.Database(savedDb) : new SQL.Database();
    
    // Executa Full Schema (CPC 27 Compliance)
    this.db.run(FULL_SCHEMA);
    
    this.isInitialized = true;
    await this.persist();
  }

  async mapLocalFolder() {
    try {
      // @ts-expect-error - File System Access API
      const handle = await window.showSaveFilePicker({
        suggestedName: 'gbr_inventario_expert.db',
        types: [{
          description: 'Banco de Dados SQL Global (Imobilizado)',
          accept: { 'application/x-sqlite3': ['.db'] },
        }],
      });
      await localforage.setItem(this.fileHandleKey, handle);
      await this.persist();
      return true;
    } catch (err) {
      console.error("Mapeamento cancelado:", err);
      throw err;
    }
  }

  async linkExistingFile() {
    try {
      // @ts-expect-error - File System Access API
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Banco de Dados SQL Global (Imobilizado)',
          accept: { 'application/x-sqlite3': ['.db'] },
        }],
      });
      
      if (handle) {
        await localforage.setItem(this.fileHandleKey, handle);
        const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
        if ((await handle.requestPermission(options)) === 'granted') {
          const file = await handle.getFile();
          const buffer = await file.arrayBuffer();
          const SQL = await initSqlJs({
            locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
          });
          this.db = new SQL.Database(new Uint8Array(buffer));
          this.isInitialized = true;
          console.log(">>> [DBA] Banco físico reconectado e carregado.");
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("Erro ao vincular arquivo existente:", err);
      throw err;
    }
  }

  async exportDatabaseFile() {
    if (!this.db) await this.init();
    const data = this.db?.export();
    if (!data) return;
    
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gbr_backup_expert.db';
    a.click();
    URL.revokeObjectURL(url);
  }

  private async persist() {
    if (!this.db) return;
    const data = this.db.export();
    
    // 1. Salva no Mapeador Físico (Se existir e tiver permissão)
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.fileHandleKey);
      if (handle) {
        const options = { mode: 'readwrite' };
        if ((await handle.queryPermission(options)) === 'granted') {
          // @ts-expect-error - createWritable is part of FileSystemFileHandle
          const writable = await handle.createWritable();
          await writable.write(data);
          await writable.close();
          console.debug(">>> [DBA] Sincronização de Arquivo Físico OK.");
        }
      }
    } catch {
      console.warn(">>> [DBA] Escrita física limitada. Dados garantidos em IndexedDB.");
    }

    // 2. Salva no IndexedDB (Cópia de Segurança redundante)
    await localforage.setItem(this.dbKey, data);
  }

  async execute(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const result = this.db?.run(sql, params);
    await this.persist();
    return result;
  }

  async query(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const stmt = this.db?.prepare(sql);
    stmt?.bind(params);
    const results = [];
    while (stmt?.step()) {
      results.push(stmt.getAsObject());
    }
    stmt?.free();
    return results;
  }
}

export const sqliteService = new SQLiteService();
