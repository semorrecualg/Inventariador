
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
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
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
CREATE TABLE IF NOT EXISTS system_status (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

class SQLiteService {
  private db: Database | null = null;
  private isInitialized = false;
  private currentDbStatus: 'EMPTY' | 'ACTIVE' = 'EMPTY';
  private storageSource: 'PHYSICAL' | 'CACHE' | 'MEMORY' = 'MEMORY';

  private get keys() {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    return {
      dbKey: `gbr_expert_db_binary_${mode}`,
      dirHandleKey: `gbr_db_dir_handle_${mode}`,
      fileHandleKey: `gbr_db_file_handle_${mode}`
    };
  }

  /**
   * Verifica se o acesso ao arquivo físico está ativo e funcional.
   * Agora prioriza o FileHandle direto se disponível.
   */
  async getFileStatus() {
    try {
      const { dirHandleKey, fileHandleKey } = this.keys;
      const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
      const suffix = mode === 'INTERNAL' ? '.Mobile' : '.Cloud';
      const defaultFileName = `gbr_inventario_expert${suffix}.db`;
      
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);

      if (!fileHandle && !dirHandle) {
        return { status: 'none', path: 'Nenhum banco físico vinculado', fileName: defaultFileName };
      }

      const handle = fileHandle || dirHandle;
      const options: unknown = { mode: 'readwrite' };
      // @ts-expect-error - queryPermission
      const permission = await handle.queryPermission(options);
      
      if (permission === 'granted') {
        let activeFileHandle = fileHandle;

        if (!activeFileHandle && dirHandle) {
          activeFileHandle = await dirHandle.getFileHandle(defaultFileName, { create: true });
        }

        if (activeFileHandle) {
          const file = await activeFileHandle.getFile();
          const folderName = dirHandle?.name || 'Arquivo Individual';
          return { 
            status: 'linked', 
            path: folderName,
            folderName: folderName,
            fileName: activeFileHandle.name,
            size: file.size,
            lastModified: new Date(file.lastModified).toISOString()
          };
        }
      }
      
      const folderName = dirHandle?.name || 'Arquivo Individual';
      return { 
        status: permission, 
        path: folderName, 
        folderName: folderName,
        fileName: fileHandle?.name || defaultFileName 
      };
    } catch (err) {
      console.error(">>> [DBA] Erro ao verificar status do arquivo:", err);
      return { status: 'error', path: 'Falha de acesso', error: String(err) };
    }
  }

  /**
   * Solicita permissão de leitura/escrita para o arquivo/diretório já vinculado
   */
  async requestFilePermission() {
    try {
      const { dirHandleKey, fileHandleKey } = this.keys;
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);
      
      const handle = fileHandle || dirHandle;
      if (!handle) return false;

      const options: unknown = { mode: 'readwrite' };
      // @ts-expect-error - requestPermission
      const status = await handle.requestPermission(options);
      
      if (status === 'granted') {
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
    const { dbKey } = this.keys;
    
    if (this.isInitialized) return;

    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }

    const SQL = await Promise.race([
      initSqlJs({
        locateFile: file => {
          // Tentativa de carregar via CDN com cache agressivo
          return `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`;
        }
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('WASM_LOAD_TIMEOUT')), 20000))
    ]).catch(err => {
      console.error(">>> [DBA] Falha crítica ao carregar motor SQL.js:", err);
      // Fallback para outros CDNs se o principal falhar
      if (err.message === 'WASM_LOAD_TIMEOUT') {
         console.warn(">>> [DBA] Tentando CDN alternativo (Unpkg)...");
         return initSqlJs({
           locateFile: file => `https://unpkg.com/sql.js@1.14.1/dist/${file}`
         }).catch(innerErr => {
           window.dispatchEvent(new CustomEvent('gbr_db_init_failed', { detail: { error: innerErr.message } }));
           throw innerErr;
         });
      }
      const errMsg = `Falha ao carregar motor SQL.js (WASM). Isso geralmente ocorre se o seu navegador não consegue acessar os serviços de CDN externos (jsdelivr.net ou unpkg.com). Se você estiver em uma rede corporativa ou VPN, peça para liberar estes domínios ou tente outra conexão. Detalhe: ${err.message}`;
      window.dispatchEvent(new CustomEvent('gbr_db_init_failed', { detail: { error: errMsg } }));
      throw new Error(errMsg);
    });

    // 2. Tenta Recuperar do Arquivo/Diretório Físico (PRIORIDADE MÁXIMA)
    try {
      const { dirHandleKey, fileHandleKey } = this.keys;
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);
      
      const handle = fileHandle || dirHandle;

      if (handle) {
        const options: unknown = { mode: 'readwrite' };
        // @ts-expect-error - queryPermission exists
        const permission = await handle.queryPermission(options);
        
        if (permission === 'granted') {
          let activeFileHandle: FileSystemFileHandle | null = fileHandle;
          
          if (!activeFileHandle && dirHandle) {
             const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
             const suffix = mode === 'INTERNAL' ? '.Mobile' : '.Cloud';
             const defaultFileName = `gbr_inventario_expert${suffix}.db`;
             activeFileHandle = await dirHandle.getFileHandle(defaultFileName, { create: true });
          }

          if (activeFileHandle) {
            const file = await activeFileHandle.getFile();
            const buffer = await file.arrayBuffer();
            
            if (buffer.byteLength > 0) {
              console.log(`>>> [DBA] Carregando do Banco Físico (${activeFileHandle.name}) - Tamanho: ${buffer.byteLength} bytes`);
              this.db = new SQL.Database(new Uint8Array(buffer));
              
              // Verificação de Integridade Básica
              try {
                this.db.run("PRAGMA integrity_check");
                console.log(">>> [DBA] Sucesso: Banco físico validado.");
              } catch (pErr) {
                console.warn(">>> [DBA] Banco físico corrompido, tentando recuperar...", pErr);
                this.db.run(FULL_SCHEMA);
              }
            } else {
              console.log(`>>> [DBA] Banco Físico vinculado mas vazio. Criando novo.`);
              this.db = new SQL.Database();
              this.db.run(FULL_SCHEMA);
            }
            
            this.isInitialized = true;
            this.storageSource = 'PHYSICAL';
            this.currentDbStatus = (await this.getSystemStatus()) as 'EMPTY' | 'ACTIVE';
            return;
          }
        } else {
          console.warn(`>>> [ALERTA] Permissão de acesso físico bloqueada: ${permission}.`);
          window.dispatchEvent(new CustomEvent('gbr_db_write_blocked', { 
            detail: { status: permission, path: handle.name } 
          }));
        }
      }
    } catch (err) {
      console.warn(">>> [DBA] Falha técnica ao ler do banco físico:", err);
    }

    // 3. Fallback: Recupera do IndexedDB (Puro Binário)
    try {
      const binary = await localforage.getItem<Uint8Array>(dbKey);
      if (binary) {
        this.db = new SQL.Database(binary);
        // Executa Full Schema (CPC 27 Compliance)
        this.db.run(FULL_SCHEMA);
        this.storageSource = 'CACHE';
        this.currentDbStatus = (await this.getSystemStatus()) as 'EMPTY' | 'ACTIVE';
        this.isInitialized = true;
        return;
      }
    } catch {
      console.warn(">>> [DBA] Cache IndexedDB não encontrado.");
    }

    // 4. Cria novo banco se nada existir
    this.db = new SQL.Database();
    this.db.run(FULL_SCHEMA);
    this.isInitialized = true;
    this.storageSource = 'MEMORY';
    this.currentDbStatus = 'EMPTY';
    await this.setSystemStatus('EMPTY');
    await this.persist();
  }

  async mapLocalFolder() {
    const { dirHandleKey, fileHandleKey } = this.keys;
    try {
      const isIframe = window.self !== window.top;
      if (isIframe) {
        console.warn(">>> [DBA] Detectado ambiente Iframe. File System Access API pode ser restrita.");
      }

      // @ts-expect-error - File System Access API
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      
      await localforage.removeItem(fileHandleKey); // Limpa o handle de arquivo se mudar para pasta
      await localforage.setItem(dirHandleKey, handle);
      this.isInitialized = false;
      await this.init();
      return true;
    } catch (err) {
      if (err instanceof Error && (err.name === 'SecurityError' || err.message.includes('sub frames'))) {
        throw new Error("IFRAME_RESTRICTION");
      }
      console.error("Mapeamento de diretório cancelado:", err);
      throw err;
    }
  }

  /**
   * Nova funcionalidade: Mapeia um ARQUIVO específico .db definido pelo usuário.
   * Isso permite "blindar" o app para trabalhar exclusivamente com um banco legado ou oficial.
   */
  async mapSpecificFile() {
    const { dirHandleKey, fileHandleKey } = this.keys;
    try {
      // @ts-expect-error - showOpenFilePicker
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'SQLite Database',
          accept: { 'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3'] }
        }],
        multiple: false
      });
      
      if (!handle) return false;

      await localforage.removeItem(dirHandleKey); // Limpa o handle de pasta se mudar para arquivo específico
      await localforage.setItem(fileHandleKey, handle);
      this.isInitialized = false;
      await this.init();
      return true;
    } catch (err) {
      console.error("Mapeamento de arquivo cancelado:", err);
      throw err;
    }
  }

  async linkExistingFile() {
    return this.mapLocalFolder();
  }

  async exportDatabaseFile(): Promise<Blob | null> {
    if (!this.db) await this.init();
    const data = this.db?.export();
    if (!data) return null;
    
    return new Blob([data], { type: 'application/x-sqlite3' });
  }

  /**
   * Força a gravação do banco da memória para o armazenamento físico e cache.
   * Chamado após cada operação de escrita.
   */
  private async persist() {
    if (!this.db) return;
    const { dbKey, dirHandleKey, fileHandleKey } = this.keys;
    
    try {
      const data = this.db.export();
      const fileSize = data.length;
      
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);
      
      let physicalSaved = false;
      const activeHandle = fileHandle || dirHandle;

      if (activeHandle) {
        const options = { mode: 'readwrite' as const };
        // @ts-expect-error - queryPermission
        const permission = await activeHandle.queryPermission(options);
        
        if (permission === 'granted') {
          let writableHandle: FileSystemFileHandle | null = fileHandle;
          
          if (!writableHandle && dirHandle) {
            const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
            const suffix = mode === 'INTERNAL' ? '.Mobile' : '.Cloud';
            const fileName = `gbr_inventario_expert${suffix}.db`;
            writableHandle = await dirHandle.getFileHandle(fileName, { create: true });
          }

          if (writableHandle) {
            const writable = await writableHandle.createWritable();
            await writable.write(data);
            await writable.close();
            physicalSaved = true;
            console.log(`>>> [Sincronização OK] Base Física: ${writableHandle.name} | Tamanho: ${fileSize} bytes`);
          }
        } else {
          console.warn(`>>> [ALERTA] Gravação física bloqueada! Status: ${permission}.`);
          window.dispatchEvent(new CustomEvent('gbr_db_write_blocked', { 
            detail: { status: permission, path: activeHandle.name } 
          }));
        }
      }

      // Salva no IndexedDB como segurança redundante
      await localforage.setItem(dbKey, data);
      
      window.dispatchEvent(new CustomEvent('gbr_db_persisted', { 
        detail: { 
          size: fileSize, 
          timestamp: new Date().toISOString(), 
          physical: physicalSaved 
        } 
      }));
    } catch (err) {
      console.error(">>> [ERRO CRÍTICO] Falha ao comitar banco de dados:", err);
    }
  }

  async execute(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const result = this.db?.run(sql, params);
    await this.persist();
    return result;
  }

  /**
   * Executa múltiplos comandos e persiste apenas uma vez ao final.
   * CRITICAL: Fundamental para performance no modo de Carga Expert Mobile.
   */
  async executeBatch(commands: { sql: string, params?: SqlValue[] }[]) {
    if (!this.db) await this.init();
    
    try {
      this.db?.run("BEGIN TRANSACTION");
      console.debug(`>>> [DBA] Iniciando Processamento em Lote (${commands.length} comandos)...`);
      
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        this.db?.run(cmd.sql, cmd.params);
        
        if (i > 0 && i % 1000 === 0) {
          console.debug(`>>> [DBA] Progresso Bancário: ${i}/${commands.length} processados...`);
        }
      }
      
      this.db?.run("COMMIT");
      console.debug(`>>> [DBA] Transação finalizada com sucesso.`);
    } catch (err) {
      console.error(`>>> [DBA] Erro fatal no lote: ${err instanceof Error ? err.message : String(err)}`);
      this.db?.run("ROLLBACK");
      throw err;
    } finally {
      await this.persist();
    }
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

  /**
   * Gerencia o status de uso do banco de dados para permitir auto-boot.
   */
  async getSystemStatus(): Promise<string> {
    try {
      const results = await this.query("SELECT value FROM system_status WHERE key = 'db_status'");
      return results.length > 0 ? (results[0].value as string) : 'EMPTY';
    } catch {
      return 'EMPTY';
    }
  }

  async setSystemStatus(status: 'EMPTY' | 'ACTIVE') {
    try {
      await this.execute("INSERT OR REPLACE INTO system_status (key, value) VALUES ('db_status', ?)", [status]);
      this.currentDbStatus = status;
      console.log(`>>> [DBA] Status do banco atualizado para: ${status}`);
    } catch (err) {
      console.error(">>> [DBA] Erro ao definir status do sistema:", err);
    }
  }

  getDbStatus(): 'EMPTY' | 'ACTIVE' {
    return this.currentDbStatus;
  }

  getStorageSource(): 'PHYSICAL' | 'CACHE' | 'MEMORY' {
    return this.storageSource;
  }

  async hardResetDatabase() {
    const { dbKey, dirHandleKey, fileHandleKey } = this.keys;
    this.db = null;
    this.isInitialized = false;
    this.currentDbStatus = 'EMPTY';
    await localforage.removeItem(dbKey);
    await localforage.removeItem(dirHandleKey);
    await localforage.removeItem(fileHandleKey);
    await this.init();
  }
}

export const sqliteService = new SQLiteService();
