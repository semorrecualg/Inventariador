import initSqlJs, { Database } from 'sql.js';
import localforage from 'localforage';
import { DatabaseStatus, Asset, InventoryCampaign } from '../types';

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
  
  private keys = {
    dbKey: 'sqlite_db_binary',
    fileHandleKey: 'sqlite_file_handle',
    statusKey: 'sqlite_db_status'
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
  }

  async hardResetDatabase() {
    console.log(">>> [DBA] Hard Reset solicitado...");
    await this.reset();
    await localforage.removeItem(this.keys.dbKey);
    await localforage.removeItem(this.keys.fileHandleKey);
    await localforage.removeItem(this.keys.statusKey);
    this.currentDbStatus = DatabaseStatus.EMPTY;
    this.permissionGrantedSession = false;
  }

  getIsInitialized() { return this.isInitialized; }
  getStorageSource() { return this.storageSource; }
  async getDb() { return this.db; }

  getDbStatus() { 
    return this.currentDbStatus;
  }

  async setSystemStatus(status: DatabaseStatus) {
    this.currentDbStatus = status;
    await localforage.setItem(this.keys.statusKey, status);
  }

  async getSystemStatus(): Promise<DatabaseStatus> {
    const status = await localforage.getItem<DatabaseStatus>(this.keys.statusKey);
    return status || DatabaseStatus.EMPTY;
  }

  // --- Permission & Link Flow ---
  async getFileStatus() {
    try {
      const handle = await localforage.getItem<FileSystemFileHandle>(this.keys.fileHandleKey);
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
        this.isInitialized = false; // Força re-init para ler os dados do arquivo físico
        return true;
      }
    }
    return false;
  }

  /**
   * Verifica permissões de forma robusta antes de operações críticas.
   */
  async verifyPermission(handle?: FileSystemFileHandle): Promise<boolean> {
    const targetHandle = handle || this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.keys.fileHandleKey);
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
        
        await localforage.setItem(this.keys.fileHandleKey, handle);
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
        await localforage.setItem(this.keys.fileHandleKey, handle);
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

  async mapSpecificFile() {
    return this.linkFile();
  }

  async mapLocalFolder() {
    // Para simplificar e evitar confusão, vamos usar apenas arquivo direto na v25
    return this.linkFile();
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
  async init() {
    if (this.isInitialized && this.db) {
      console.log(">>> [DBA] Sistema já inicializado. Reaproveitando instância.");
      return true;
    }
    
    console.log(">>> [DBA] Passstep 1: Verificando handles persistidos...");
    
    try {
      const SQL = await initSqlJs({ 
        locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
      });
      // Prioritize active handle (just created/linked) over localforage
      const handle = this.activeFileHandle || await localforage.getItem<FileSystemFileHandle>(this.keys.fileHandleKey);
      this.currentDbStatus = await this.getSystemStatus();

      if (handle) {
        console.log(">>> [DBA] Passo 2: Handle encontrado. Verificando permissão...");
        try {
          // Utiliza cache de sessão ou checa no navegador
          let permission = this.permissionGrantedSession ? 'granted' : 'none';
          
          if (permission !== 'granted') {
             // @ts-expect-error queryPermission is part of the experimental API
             permission = await handle.queryPermission({ mode: 'readwrite' });
          }
          
          if (permission === 'granted') {
            this.permissionGrantedSession = true;
            console.log(">>> [DBA] Passo 3: Permissão concedida. Lendo arquivo físico...");
            const file = await handle.getFile();
            const buffer = await file.arrayBuffer();
            
            this.db = new SQL.Database(new Uint8Array(buffer));
            this.db.run(FULL_SCHEMA);
            this.ensureRequiredColumns();
            
            this.storageSource = 'PHYSICAL';
            this.isInitialized = true;
            this.activeFileHandle = handle;
            console.log(">>> [DBA] SUCESSO: Banco físico montado e pronto.");
            return true;
          } else {
            console.warn(">>> [DBA] Passo 3: Permissão pendente ou negada:", permission);
          }
        } catch (err: unknown) {
          const permErr = err as Error;
          if (permErr.name === 'NotAllowedError') {
            console.error(">>> [DBA] BLOQUEIO DE SEGURANÇA: Navegador negou acesso automático.");
          } else {
            console.error(">>> [DBA] Erro ao interagir com handle:", permErr);
          }
        }
      }

      // Fallback para Cache (Neutral State)
      console.log(">>> [DBA] Tentando recuperar Cache Local (Fallback)...");
      const binary = await localforage.getItem<Uint8Array>(this.keys.dbKey);
      if (binary && binary.length > 4096) {
        this.db = new SQL.Database(binary);
        this.db.run(FULL_SCHEMA);
        this.ensureRequiredColumns();

        this.storageSource = 'CACHE';
        this.isInitialized = true;
        console.log(">>> [DBA] SUCESSO: Cache local carregado enquanto aguarda arquivo.");
        return true;
      }

      // Último caso: Novo banco em memória
      console.log(">>> [DBA] Inicializando novo banco padrão (Vazio)...");
      this.db = new SQL.Database();
      this.db.run(FULL_SCHEMA);
      this.ensureRequiredColumns();

      this.storageSource = 'MEMORY';
      this.isInitialized = true;
      return true;

    } catch (err) {
      console.error(">>> [DBA] FALHA CRÍTICA NA INICIALIZAÇÃO:", err);
      this.isInitialized = false;
      return false;
    }
  }

  // --- Persistence & Export ---
  async importDatabase(buffer: Uint8Array) {
    if (!this.db) {
       const SQL = await initSqlJs({ 
         locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
       });
       this.db = new SQL.Database(buffer);
    } else {
       // Close current and swap
       try { this.db.close(); } catch(e) { console.warn(e); }
       const SQL = await initSqlJs({ 
         locateFile: (file: string) => `https://unpkg.com/sql.js@1.14.1/dist/${file}` 
       });
       this.db = new SQL.Database(buffer);
    }
    this.isInitialized = true;
    await this.persist();
    console.log(">>> [DBA] Banco de dados importado e persistido com sucesso.");
  }

  async exportDatabase(): Promise<Uint8Array | null> {
    if (!this.db) return null;
    return this.db.export();
  }

  async downloadDatabase() {
    const binary = await this.exportDatabase();
    if (!binary) return;
    
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_inventario_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(">>> [DBA] Download do banco de dados iniciado.");
  }

  async forceSync() {
    console.log(">>> [DBA] Forçando sincronização física manual...");
    await this.persist();
    return true;
  }

  async persist() {
    if (!this.db) return;
    try {
      const binary = this.db.export();
      await localforage.setItem(this.keys.dbKey, binary);
      
      if (this.storageSource === 'PHYSICAL' && this.activeFileHandle) {
        try {
          const writable = await this.activeFileHandle.createWritable();
          await writable.write(binary);
          await writable.close();
          console.log(">>> [DBA] Sincronização Física OK:", this.activeFileHandle.name);
        } catch (err: unknown) {
          const e = err as Error;
          if (e.name === 'NotAllowedError') {
            console.warn(">>> [DBA] Permissão de escrita expirou. Dados salvos apenas no cache.");
          } else {
            console.error(">>> [DBA] Falha na escrita física:", e);
          }
        }
      }
    } catch (err) {
      console.error(">>> [DBA] Falha na persistência:", err);
    }
  }

  // --- Helpers ---
  async execute(sql: string, params: unknown[] = []) {
    if (!this.db) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.db.run(sql, params as any[]);
    await this.persist();
  }

  async executeBatch(queries: { sql: string; params: unknown[] }[], skipPersist = false) {
    if (!this.db) return;
    this.db.run("BEGIN TRANSACTION");
    try {
      for (const q of queries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.db.run(q.sql, q.params as any[]);
      }
      this.db.run("COMMIT");
      if (!skipPersist) await this.persist();
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }

  async query(sql: string, params: unknown[] = []) {
    if (!this.db) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  async getAllAssets() {
    return this.query("SELECT * FROM assets WHERE _is_deleted = 0");
  }

  async getAssetCount(): Promise<number> {
    const res = await this.query("SELECT COUNT(*) as total FROM assets WHERE _is_deleted = 0");
    return Number(res[0]?.total || 0);
  }

  // --- Inventory Config ---
  async saveInventoryConfig(data: unknown) {
    const tenantId = (data as { _tenantid?: string })._tenantid || 'default';
    await this.execute(
      "INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)",
      [tenantId, tenantId, JSON.stringify(data)]
    );
  }

  async getInventoryConfig(tenantId?: string): Promise<unknown | null> {
    const tid = tenantId || 'default';
    const res = await this.query("SELECT data FROM inventory_config WHERE _tenantid = ?", [tid]);
    if (!res[0]?.data) return null;
    try {
      return JSON.parse(res[0].data as string);
    } catch {
      return null;
    }
  }

  // --- Bulk Ops ---
  async bulkInsertAssets(assets: Asset[], skipPersist = false) {
    if (!this.db) return;
    console.log(`>>> [DBA] Iniciando Insert em Lote de ${assets.length} ativos...`);
    
    /* eslint-disable no-var */
    this.db.run("BEGIN TRANSACTION");
    try {
    var sqlBulk = `INSERT OR REPLACE INTO assets (
        id, ETIQUETA, DESCRICAODOBEM, GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, 
        CC_CUSTO, CONTA_CONTABIL, STATUS, DATA_HORA_CONFERENCIA, 
        LATITUDE, LONGITUDE, DATAAQUISIC, VLRAQUISIC, NOTAFISCAL, 
        NOMEFORNECEDOR, CNPJ, SERIAL, ENDERECO, REGISTRO, SUBREG,
        DATABAIXA, PRIMARYKEY, Sn1_recno, Sn3_recno,
        _unitid, _tenantid, _photoUrl, TAG_INVENTARIO, _lastUpdated, _conferido, _is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      var stmtBulk = this.db.prepare(sqlBulk);
      
      for (var i = 0; i < assets.length; i++) {
        var asset = assets[i];
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
      console.log(">>> [DBA] Insert em Lote concluído.");
    } catch (e) {
      if (this.db) this.db.run("ROLLBACK");
      console.error(">>> [DBA] Erro no bulkInsertAssets:", e);
      throw e;
    }
  }

  // --- Campaigns ---
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
  }
}

export const sqliteService = new SqliteService();
