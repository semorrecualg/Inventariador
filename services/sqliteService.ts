
import localforage from 'localforage';
import initSqlJs, { Database, SqlValue } from 'sql.js';
import { InventoryCampaign, Asset, InventoryState } from '../types';

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
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    status TEXT,
    start_date TEXT,
    end_date TEXT,
    _tenantid TEXT,
    _unitid TEXT,
    created_by TEXT,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS system_status (
    key TEXT PRIMARY KEY,
    value TEXT
);
`;

class SQLiteService {
  private db: Database | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private isPersisting = false;
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
    if (this.isPersisting) {
      return { status: 'busy', linkType: 'UNKNOWN', path: '', folderName: '', fileName: '' };
    }
    
    try {
      const { dirHandleKey, fileHandleKey } = this.keys;
      const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
      const suffix = mode === 'INTERNAL' ? '.Mobile' : '.Cloud';
      const defaultFileName = `gbr_inventario_expert${suffix}.db`;
      
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);

      if (fileHandle || dirHandle) {
        const handle = fileHandle || dirHandle;
        const options: unknown = { mode: 'readwrite' };
        // @ts-expect-error - queryPermission
        const permission = await handle.queryPermission(options);
        
        if (permission === 'granted') {
          let finalFileHandle = fileHandle;

          if (!finalFileHandle && dirHandle) {
            finalFileHandle = await dirHandle.getFileHandle(defaultFileName, { create: true });
          }

          if (finalFileHandle) {
            const file = await finalFileHandle.getFile();
            const folderName = dirHandle?.name || 'Arquivo Individual';
            return { 
              status: 'linked', 
              linkType: dirHandle ? 'DIRECTORY' : 'FILE',
              path: folderName,
              folderName: folderName,
              fileName: finalFileHandle.name,
              size: file.size,
              lastModified: new Date(file.lastModified).toISOString()
            };
          }
        }
        
        const folderName = dirHandle?.name || 'Arquivo Individual';
        return { 
          status: permission, 
          linkType: dirHandle ? 'DIRECTORY' : 'FILE',
          path: folderName, 
          folderName: folderName,
          fileName: fileHandle?.name || defaultFileName 
        };
      }

      return { status: 'none', path: 'Nenhum banco físico vinculado', fileName: defaultFileName, linkType: 'NONE' };
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
        console.log(">>> [DBA] Permissão concedida pelo usuário.");
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

  /**
   * Tenta encontrar o arquivo de banco de dados no diretório seguindo a regra de nomes (novo -> legado)
   */
  private async findDatabaseFile(dirHandle: FileSystemDirectoryHandle): Promise<FileSystemFileHandle> {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    const suffix = mode === 'INTERNAL' ? '.Mobile' : '.Cloud';
    const currentName = `gbr_inventario_expert${suffix}.db`;
    const legacyName = `gbr_inventario_expert.db`;
    
    // 1. Tenta o nome atual
    try {
      return await dirHandle.getFileHandle(currentName, { create: false });
    } catch {
      // 2. Tenta o nome legado
      try {
        const legacyHandle = await dirHandle.getFileHandle(legacyName, { create: false });
        console.log(`>>> [DBA] Arquivo legado encontrado: ${legacyName}.`);
        return legacyHandle;
      } catch {
        // 3. Se não encontrar nenhum, cria o novo
        console.log(`>>> [DBA] Nenhum arquivo existente encontrado em ${dirHandle.name}. Criando novo: ${currentName}`);
        return await dirHandle.getFileHandle(currentName, { create: true });
      }
    }
  }

  async init() {
    const { dbKey, dirHandleKey, fileHandleKey } = this.keys;
    
    if (this.isInitialized) return;
    if (this.isInitializing) {
      // Aguarda inicialização em curso
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.isInitializing = true;
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }

      const SQL = await Promise.race([
        initSqlJs({
          locateFile: file => {
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
        const errMsg = `Falha ao carregar motor SQL.js (WASM). Detalhe: ${err.message}`;
        window.dispatchEvent(new CustomEvent('gbr_db_init_failed', { detail: { error: errMsg } }));
        throw new Error(errMsg);
      });

      // 2. Tenta Recuperar do Arquivo/Diretório Físico (PRIORIDADE MÁXIMA)
      const fileHandle = await localforage.getItem<FileSystemFileHandle>(fileHandleKey);
      const dirHandle = await localforage.getItem<FileSystemDirectoryHandle>(dirHandleKey);
      const handle = fileHandle || dirHandle;

      if (handle) {
        try {
          const options: unknown = { mode: 'readwrite' };
          // @ts-expect-error - queryPermission exists
          const permission = await handle.queryPermission(options);
          
          if (permission === 'granted') {
            let activeFileHandle = fileHandle;
            if (!activeFileHandle && dirHandle) {
               activeFileHandle = await this.findDatabaseFile(dirHandle);
            }

            if (activeFileHandle) {
              const file = await activeFileHandle.getFile();
              const buffer = await file.arrayBuffer();
              
              if (buffer.byteLength > 4096) { // Mínimo de 4KB para ser uma base válida
                console.log(`>>> [DBA] Carregando do Banco Físico (${activeFileHandle.name}) - Tamanho: ${buffer.byteLength} bytes`);
                this.db = new SQL.Database(new Uint8Array(buffer));
                
                // Verificação de Integridade Básica
                try {
                  this.db.run("PRAGMA integrity_check");
                  console.log(">>> [DBA] Sucesso: Banco físico validado.");
                } catch (pErr) {
                  console.warn(">>> [DBA] Banco físico corrompido ou incompleto, tentando recuperar schema...", pErr);
                  this.db.run(FULL_SCHEMA);
                }
              } else {
                console.warn(`>>> [DBA] Arquivo Físico (${activeFileHandle.name}) muito pequeno (${buffer.byteLength} bytes). Verificando cache IndexedDB.`);
                // Se o arquivo físico estiver vazio, tentamos o IndexedDB antes de desistir e criar um novo
                const binary = await localforage.getItem<Uint8Array>(dbKey);
                if (binary && binary.length > 4096) {
                  console.log(">>> [DBA] Recuperando dados do cache IndexedDB para o arquivo físico...");
                  this.db = new SQL.Database(binary);
                  this.db.run(FULL_SCHEMA);
                } else {
                  console.log(">>> [DBA] Cache IndexedDB também vazio. Inicializando novo schema.");
                  this.db = new SQL.Database();
                  this.db.run(FULL_SCHEMA);
                }
                await this.persist();
              }
              
              this.isInitialized = true;
              this.storageSource = 'PHYSICAL';
              this.currentDbStatus = (await this.getSystemStatus()) as 'EMPTY' | 'ACTIVE';
              return;
            }
          } else {
            console.warn(`>>> [DBA] Acesso físico bloqueado (${permission}). Prioridade mantida ao físico, não inicializando banco substituto.`);
            // CRITICAL: Se temos um handle mas não temos permissão, não carregamos NADA.
            // Isso força o usuário a reconfirmar a permissão em vez de trabalhar com um banco vazio e depois sobrescrever o original.
            this.isInitializing = false;
            return;
          }
        } catch (err) {
          console.warn(">>> [DBA] Falha técnica ao ler do banco físico:", err);
        }
      }

      // 3. Fallback: Recupera do IndexedDB (Puro Binário) - Apenas se NÃO houver handle físico salvo
      if (!handle) {
        try {
          const binary = await localforage.getItem<Uint8Array>(dbKey);
          if (binary) {
            this.db = new SQL.Database(binary);
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
    } finally {
      // Migração Silenciosa de Campanhas (LocalStorage -> SQLite)
      if (this.isInitialized) {
        const cachedCampaigns = localStorage.getItem('inventory_campaigns_cache');
        if (cachedCampaigns) {
          try {
            const parsed = JSON.parse(cachedCampaigns);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`>>> [Migração] Verificando ${parsed.length} campanhas legadas para sincronismo...`);
              for (const camp of parsed) {
                await this.saveCampaign(camp);
              }
            }
          } catch (e) {
            console.error(">>> [Migração] Erro ao sincronizar campanhas legadas:", e);
          }
        }
      }
      this.isInitializing = false;
    }
  }

  async mapLocalFolder() {
    if (this.isInitializing) return false;
    
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
      
      if (!handle) return false;

      await localforage.removeItem(fileHandleKey); // Limpa o handle de arquivo se mudar para pasta
      await localforage.setItem(dirHandleKey, handle);
      
      this.isInitialized = false;
      await this.init();
      return true;
    } catch (err) {
      if (err instanceof Error && (err.name === 'SecurityError' || err.message.includes('sub frames'))) {
        throw new Error("IFRAME_RESTRICTION");
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return false;
      }
      console.error("Mapeamento de diretório cancelado ou falhou:", err);
      throw err;
    }
  }

  /**
   * Nova funcionalidade: Mapeia um ARQUIVO específico .db definido pelo usuário.
   * Isso permite "blindar" o app para trabalhar exclusivamente com um banco legado ou oficial.
   */
  async mapSpecificFile() {
    if (this.isInitializing) return false;

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
      if (err instanceof Error && err.name === 'AbortError') return false;
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
    if (!this.db || this.isPersisting) return;
    this.isPersisting = true;
    
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
            try {
              writableHandle = await dirHandle.getFileHandle(fileName, { create: true });
            } catch (handleErr) {
              console.error(">>> [ALERTA] Falha ao obter handle de escrita:", handleErr);
            }
          }

          if (writableHandle) {
            try {
              const writable = await writableHandle.createWritable();
              await writable.write(data);
              await writable.close();
              physicalSaved = true;
              console.log(`>>> [Sincronização OK] Base Física: ${writableHandle.name} | Tamanho: ${fileSize} bytes`);
            } catch (writeErr) {
              console.error(">>> [ALERTA] Falha ao gravar no arquivo físico. Arquivo pode estar sendo usado por outro processo ou aba.", writeErr);
              window.dispatchEvent(new CustomEvent('gbr_db_write_failed', { 
                detail: { error: writeErr, fileName: writableHandle.name } 
              }));
            }
          }
        } else {
          console.warn(`>>> [ALERTA] Gravação física bloqueada! Status: ${permission}.`);
          window.dispatchEvent(new CustomEvent('gbr_db_write_blocked', { 
            detail: { status: permission, path: activeHandle.name } 
          }));
        }
      }

      // Salva no IndexedDB como segurança redundante (Sempre ocorre, mesmo se o físico falhar)
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
    } finally {
      this.isPersisting = false;
    }
  }

  async execute(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const result = this.db?.run(sql, params);
    await this.persist();
    return result;
  }

  async query(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const res = this.db?.exec(sql, params);
    if (!res || res.length === 0) return [];
    
    const columns = res[0].columns;
    return res[0].values.map(row => {
      const obj: Record<string, SqlValue> = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    }) as unknown as Record<string, SqlValue>[];
  }

  async saveCampaign(campaign: Partial<InventoryCampaign>) {
    const sql = `
      INSERT OR REPLACE INTO campaigns (id, name, description, status, start_date, end_date, _tenantid, _unitid, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      campaign.id || null,
      campaign.name || null,
      campaign.description || null,
      campaign.status || null,
      campaign.start_date || null,
      campaign.end_date || null,
      campaign._tenantid || (campaign as { tenantid?: string }).tenantid || null,
      campaign._unitid || (campaign as { unit_id?: string }).unit_id || null,
      campaign.created_by || null,
      campaign.created_at || new Date().toISOString()
    ];
    return this.execute(sql, params);
  }

  async getCampaigns(tenantId: string) {
    return this.query("SELECT * FROM campaigns WHERE _tenantid = ? ORDER BY start_date DESC", [tenantId]);
  }

  async deleteCampaignSql(id: string) {
    return this.execute("DELETE FROM campaigns WHERE id = ?", [id]);
  }

  // --- MÉTODOS DE INVENTÁRIO (Soberania de Dados) ---

  async getAllAssets(): Promise<Asset[]> {
    if (!this.db) await this.init();
    return this.query("SELECT * FROM assets WHERE _is_deleted = 0") as unknown as Asset[];
  }

  async getAssetCount(): Promise<number> {
    if (!this.db) await this.init();
    const res = await this.query("SELECT COUNT(*) as total FROM assets WHERE _is_deleted = 0");
    return res.length > 0 ? (res[0].total as number) : 0;
  }

  async bulkInsertAssets(assets: Asset[]) {
    if (!this.db) await this.init();
    if (assets.length === 0) return;

    console.log(`>>> [DBA] Iniciando persistência de ${assets.length} ativos no banco físico...`);
    
    // Schema mapping para garantir que todas as colunas sejam preenchidas corretamente
    const sql = `
      INSERT OR REPLACE INTO assets (
        id, ETIQUETA, REGISTRO, DESCRICAODOATIVO, VLRAQUISIC, DATAAQUISIC, 
        CENTRODECUSTO, CONTACONTABIL, TAG_INVENTARIO, ESTADO_CONSERVACAO, 
        GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, UNIDADE, QT, SERIAL, CNPJ, 
        NOMEFORNECEDOR, NOTAFISCAL, ENDERECO, SUBREG, DATABAIXA, PRIMARYKEY, 
        _tenantid, _unitid, _unidade, _conferido, _localMaster, _lastUpdated, 
        _dataLeitura, _auditor, _photoUrl, _lat, _lng, _campaignId, _version, 
        _is_deleted, _plaquetado, _plaquetaMaster, _descricaoMaster, _aprovado, 
        _dataAprovacao, _aprovador, _assinatura, _isNew, _is_unitized, 
        _is_divergent_baixa, Sn1_recno, Sn3_recno, DE_PARA, 
        AUDITOR_STATUS_CONFERENCIA, _origemTransacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const commands = assets.map(a => ({
      sql,
      params: [
        a.id || null, a.ETIQUETA || null, a.REGISTRO || null, a.DESCRICAODOATIVO || null, a.VLRAQUISIC || 0, a.DATAAQUISIC || null,
        a.CENTRODECUSTO || null, a.CONTACONTABIL || null, a.TAG_INVENTARIO || null, a.ESTADO_CONSERVACAO || null,
        a.GRUPO_EMPRESARIAL || null, a.UNIDADE_OPERACIONAL || null, a.UNIDADE || null, a.QT || null, a.SERIAL || null, a.CNPJ || null,
        a.NOMEFORNECEDOR || null, a.NOTAFISCAL || null, a.ENDERECO || null, a.SUBREG || null, a.DATABAIXA || null, a.PRIMARYKEY || null,
        a._tenantid || null, a._unitid || null, a._unidade || null, a._conferido ? 1 : 0, a._localMaster || null, a._lastUpdated || null,
        a._dataLeitura || null, a._auditor || null, a._photoUrl || null, a._lat || null, a._lng || null, a._campaignId || null, a._version || 1,
        a._is_deleted ? 1 : 0, a._plaquetado ? 1 : 0, a._plaquetaMaster || null, a._descricaoMaster || null, a._aprovado ? 1 : 0,
        a._dataAprovacao || null, a._aprovador || null, a._assinatura || null, a._isNew ? 1 : 0, a._is_unitized ? 1 : 0,
        a._is_divergent_baixa ? 1 : 0, a.Sn1_recno || null, a.Sn3_recno || null, a.DE_PARA || null,
        a.AUDITOR_STATUS_CONFERENCIA || null, a._origemTransacao || null
      ] as SqlValue[]
    }));

    await this.executeBatch(commands);
    this.currentDbStatus = 'ACTIVE';
    console.log(`>>> [DBA] Persistência física concluída para ${assets.length} ativos.`);
  }

  async saveInventoryConfig(config: Partial<InventoryState>) {
    if (!this.db) await this.init();
    const data = JSON.stringify(config);
    return this.execute("INSERT OR REPLACE INTO system_status (key, value) VALUES ('inventory_config', ?)", [data]);
  }

  async getInventoryConfig(): Promise<Partial<InventoryState> | null> {
    if (!this.db) await this.init();
    const res = await this.query("SELECT value FROM system_status WHERE key = 'inventory_config'");
    if (res.length > 0) {
      try {
        return JSON.parse(res[0].value as string);
      } catch {
        return null;
      }
    }
    return null;
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
