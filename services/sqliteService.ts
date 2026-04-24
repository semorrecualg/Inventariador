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
    _conferido INTEGER DEFAULT 0
);
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
  }

  async hardResetDatabase() {
    console.log(">>> [DBA] Hard Reset solicitado...");
    await this.reset();
    await localforage.removeItem(this.keys.dbKey);
    await localforage.removeItem(this.keys.fileHandleKey);
    await localforage.removeItem(this.keys.statusKey);
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

      // @ts-expect-error mode property is part of the experimental API
      const currentPerm = await handle.queryPermission({ mode: 'readwrite' });
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
      // @ts-expect-error requestPermission is part of the experimental API
      return await status.handle.requestPermission({ mode: 'readwrite' });
    }
    return 'none';
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

  // --- Initialization Flow ---
  async init() {
    console.log(">>> [DBA] Passstep 1: Verificando handles persistidos...");
    
    try {
      const SQL = await initSqlJs({ locateFile: (file: string) => `https://sql.js.org/dist/${file}` });
      const handle = await localforage.getItem<FileSystemFileHandle>(this.keys.fileHandleKey);
      this.currentDbStatus = await this.getSystemStatus();

      if (handle) {
        console.log(">>> [DBA] Passo 2: Handle encontrado. Solicitando permissão...");
        try {
          // @ts-expect-error queryPermission is part of the experimental API
          const permission = await handle.queryPermission({ mode: 'readwrite' });
          
          if (permission === 'granted') {
            console.log(">>> [DBA] Passo 3: Permissão concedida. Lendo arquivo físico...");
            const file = await handle.getFile();
            const buffer = await file.arrayBuffer();
            
            this.db = new SQL.Database(new Uint8Array(buffer));
            this.db.run(FULL_SCHEMA);
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
        this.storageSource = 'CACHE';
        this.isInitialized = true;
        console.log(">>> [DBA] SUCESSO: Cache local carregado enquanto aguarda arquivo.");
        return true;
      }

      // Último caso: Novo banco em memória
      console.log(">>> [DBA] Inicializando novo banco padrão (Vazio)...");
      this.db = new SQL.Database();
      this.db.run(FULL_SCHEMA);
      this.storageSource = 'MEMORY';
      this.isInitialized = true;
      return true;

    } catch (err) {
      console.error(">>> [DBA] FALHA CRÍTICA NA INICIALIZAÇÃO:", err);
      this.isInitialized = false;
      return false;
    }
  }

  // --- Persistence ---
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

  async executeBatch(queries: { sql: string; params: unknown[] }[]) {
    if (!this.db) return;
    this.db.run("BEGIN TRANSACTION");
    try {
      for (const q of queries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.db.run(q.sql, q.params as any[]);
      }
      this.db.run("COMMIT");
      await this.persist();
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
  async saveInventoryConfig(data: any) {
    const tenantId = data._tenantid || 'default';
    await this.execute(
      "INSERT OR REPLACE INTO inventory_config (id, _tenantid, data) VALUES (?, ?, ?)",
      [tenantId, tenantId, JSON.stringify(data)]
    );
  }

  async getInventoryConfig(tenantId?: string): Promise<any | null> {
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
  async bulkInsertAssets(assets: Asset[]) {
    const queries = assets.map(asset => ({
      sql: `INSERT OR REPLACE INTO assets (
        id, ETIQUETA, DESCRICAODOBEM, GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, 
        _unitid, _tenantid, _photoUrl, TAG_INVENTARIO, STATUS, _lastUpdated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        asset.id, asset.ETIQUETA, asset.DESCRICAODOATIVO, asset.GRUPO_EMPRESARIAL, asset.UNIDADE_OPERACIONAL,
        asset._unitid, asset._tenantid, asset._photoUrl, asset.TAG_INVENTARIO, asset.STATUS, asset._lastUpdated
      ]
    }));
    await this.executeBatch(queries);
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
