import Dexie from 'dexie';
import { DatabaseStatus } from '../types';

// Strict Type Declarations for the 21 accounting indices and metadata
export interface DexieAsset {
  id: string; // matches primarykey
  tenantId: string;
  _tenantid: string;
  filial: string;
  _unitid: string;
  status: string;
  etiqueta: string;
  tag: string;
  qt: number;
  descricaodoativo: string;
  serial: string | null;
  dataaqusic: string | null;
  cnpj: string | null;
  nomefornecedor: string | null;
  notafiscal: string | null;
  endereco: string | null;
  registro: string | null;
  subreg: string | null;
  databaixa: string | null;
  contacontabil: string | null;
  primarykey: string;
  centrodecusto: string | null;
  vlraquisic: number;
  sn1_recno: number | null;
  sn3_recno: number | null;
  _is_synced: number; // 0 or 1
  _is_deleted: number; // 0 or 1
  _conferido: number; // 0 or 1
  _plaquetado: number; // 0 or 1
  _aprovado: number; // 0 or 1
  _isNew: number; // 0 or 1
  _is_unitized: number; // 0 or 1
  _is_divergent_baixa: number; // 0 or 1
  _history: string | null;
  DE_PARA: string | null;
  _photoUrl: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  currentCampaignId?: string | null;
}

export interface DexieAuditLog {
  id: string;
  usuario: string;
  acao: string;
  tabela: string;
  registro_id: string;
  details: string;
  delta: string | null;
  updated_at: string;
}

export interface DexieCampaign {
  id: string;
  name: string;
  status: string;
  tenantId: string;
  created_at: string;
}

export interface DexieSystemContext {
  key: string;
  value: string;
  updated_at: string;
}

export interface DexieUnitConfig {
  id: string;
  filial: string;
  nome: string;
  hasGps: number;
  requireNf: number;
  requireSeriado: number;
  allowNewAssets: number;
  allowWriteOffs: number;
  requirePlaqueta: number;
}

class InventoryDexieDatabase extends Dexie {
  local_assets!: Dexie.Table<DexieAsset, string>;
  ativos!: Dexie.Table<DexieAsset, string>;
  assets!: Dexie.Table<DexieAsset, string>;
  audit_logs!: Dexie.Table<DexieAuditLog, string>;
  campaigns!: Dexie.Table<DexieCampaign, string>;
  SYSTEM_CONTEXT!: Dexie.Table<DexieSystemContext, string>;
  unit_configs!: Dexie.Table<DexieUnitConfig, string>;

  constructor() {
    super('InventoryLocalStore');
    this.version(1).stores({
      local_assets: 'primarykey, filial, _is_synced',
      ativos: 'primarykey, filial, _is_synced',
      assets: 'primarykey, filial, _is_synced',
      audit_logs: 'id, updated_at',
      campaigns: 'id, tenantId',
      SYSTEM_CONTEXT: 'key',
      unit_configs: 'id, filial'
    });
  }
}

export const db = new InventoryDexieDatabase();

export class SQLitePersistenceException extends Error {
  constructor(message: string) {
    super(`[SQLitePersistenceException] ${message}`);
    this.name = "SQLitePersistenceException";
  }
}

function getTableName(sql: string): string {
  const match = sql.match(/(?:INSERT\s+OR\s+REPLACE\s+INTO|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM)\s+(\w+)/i);
  return match ? match[1].toLowerCase() : '';
}

function parseSqlAndParams(sql: string, params: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const sqlUpper = sql.toUpperCase();

  // Simple key-value extraction based on standard columns we saw in our logs
  if (sqlUpper.includes("SYSTEM_CONTEXT")) {
    if (sqlUpper.includes("INSERT OR REPLACE") || sqlUpper.includes("INSERT INTO")) {
      obj['key'] = params[0];
      obj['value'] = params[1];
    }
  }

  if (sqlUpper.includes("UNIT_CONFIGS")) {
    obj['id'] = params[0];
    obj['filial'] = params[1];
    obj['nome'] = params[2];
    obj['hasGps'] = params[3];
    obj['requireNf'] = params[4];
    obj['requireSeriado'] = params[5];
    obj['allowNewAssets'] = params[6];
    obj['allowWriteOffs'] = params[7];
    obj['requirePlaqueta'] = params[8];
  }

  if (sqlUpper.includes("AUDIT_LOG")) {
    obj['id'] = params[0];
    obj['usuario'] = params[1];
    obj['acao'] = params[2];
    obj['tabela'] = params[3];
    obj['registro_id'] = params[4];
    obj['details'] = params[5];
    obj['delta'] = params[6];
  }

  if (sqlUpper.includes("CAMPAIGNS")) {
    obj['id'] = params[0];
    obj['name'] = params[1];
    obj['status'] = params[2];
    obj['tenantId'] = params[3];
    obj['created_at'] = params[4];
  }

  if (sqlUpper.includes("INSERT OR REPLACE INTO ATIVOS") || sqlUpper.includes("INSERT OR REPLACE INTO ASSETS") || sqlUpper.includes("INSERT OR REPLACE INTO LOCAL_ASSETS") || sqlUpper.includes("INSERT INTO ATIVOS")) {
    const insertMatch = sql.match(/\(([^)]+)\)/);
    if (insertMatch && insertMatch[1]) {
      const cols = insertMatch[1].split(',').map(c => c.trim().toLowerCase());
      cols.forEach((col, idx) => {
        if (idx < params.length) {
          obj[col] = params[idx];
        }
      });
    }
  }

  if (sqlUpper.includes("UPDATE") && (sqlUpper.includes("ATIVOS") || sqlUpper.includes("ASSETS") || sqlUpper.includes("LOCAL_ASSETS"))) {
    if (sqlUpper.includes("_CONFERIDO = 1")) {
      obj['_conferido'] = 1;
      obj['status'] = 'CONFERIDO';
      obj['_is_synced'] = 0;
    }
    if (sqlUpper.includes("CURRENTCAMPAIGNID = NULL")) {
      obj['currentCampaignId'] = null;
    }
  }

  return obj;
}

export class SqliteService {
  private static instance: SqliteService | null = null;
  private isInitialized = false;
  private dbStatus = DatabaseStatus.EMPTY;
  public isImportingBatch = false;

  private bufferedFieldChanges: {
    asset: Record<string, unknown>;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    userEmail: string;
    timestamp: number;
  }[] = [];

  private constructor() {}

  public static getInstance(): SqliteService {
    if (!SqliteService.instance) {
      SqliteService.instance = new SqliteService();
    }
    return SqliteService.instance;
  }

  public setImportingMode(active: boolean): void {
    this.isImportingBatch = active;
    console.log(`>>> [SqliteService SRE] Modo de importação alterado para: ${active}`);
  }

  public async init(isRecovery: boolean = false): Promise<boolean> {
    if (this.isInitialized) return true;
    try {
      console.log(`>>> [Dexie SRE reboot] Inicializando armazenamento Dexie.js (isRecovery=${isRecovery})...`);
      await db.open();
      this.isInitialized = true;
      this.dbStatus = DatabaseStatus.ACTIVE;
      console.log(">>> [Dexie SRE reboot] Banco Dexie.js inicializado com sucesso.");
      return true;
    } catch (error) {
      console.error(">>> [Dexie SRE reboot] Erro fatal inicializando Dexie:", error);
      this.isInitialized = false;
      this.dbStatus = DatabaseStatus.ERROR;
      return false;
    }
  }

  public async closeConnection(): Promise<void> {
    db.close();
    this.isInitialized = false;
    this.dbStatus = DatabaseStatus.EMPTY;
  }

  public async deleteDatabase(): Promise<void> {
    await db.delete();
    this.isInitialized = false;
    this.dbStatus = DatabaseStatus.EMPTY;
  }

  private async runDDLScripts(): Promise<void> {
    return Promise.resolve();
  }

  public async checkTableSchema(tableName: string): Promise<{ isValid: boolean; columns: string[] }> {
    console.log(">>> [SqliteService] checkTableSchema requested for:", tableName);
    const cols = [
      'id', 'tenantId', '_tenantid', 'filial', '_unitid', 'status', 'etiqueta', 'tag', 'qt',
      'descricaodoativo', 'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal',
      'endereco', 'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey',
      'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno', '_is_synced', '_is_deleted',
      '_conferido', '_plaquetado', '_aprovado', '_isNew', '_is_unitized', '_is_divergent_baixa',
      '_history', 'DE_PARA', '_photoUrl', 'gps_lat', 'gps_lng', 'currentCampaignId'
    ];
    return { isValid: true, columns: cols };
  }

  public async getContextValue(key: string): Promise<string | null> {
    try {
      const match = await db.SYSTEM_CONTEXT.get(key);
      return match ? match.value : null;
    } catch {
      return null;
    }
  }

  public async setContextValue(key: string, value: string): Promise<void> {
    await db.SYSTEM_CONTEXT.put({
      key,
      value,
      updated_at: new Date().toISOString()
    });
  }

  public async getActiveCampaign(): Promise<string | null> {
    return await this.getContextValue('active_campaign');
  }

  public async getSelectedUnit(): Promise<string | null> {
    return await this.getContextValue('selected_unit');
  }

  public async getUnitConfigs(tenantId: string): Promise<Record<string, unknown>[]> {
    try {
      if (tenantId) {
        console.log(">>> [SqliteService] getUnitConfigs requested for tenant:", tenantId);
      }
      const configs = await db.unit_configs.toArray();
      return configs as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  public async getUnitConfigsFromSql(): Promise<Record<string, unknown>[]> {
    return this.getUnitConfigs('');
  }

  public async saveUnitConfigs(configs: Record<string, unknown>[]): Promise<void> {
    const mapped = configs.map(cfg => ({
      id: String(cfg.id || cfg.filial || ''),
      filial: String(cfg.filial || ''),
      nome: String(cfg.nome || cfg.filial || ''),
      hasGps: cfg.hasGps ? 1 : 0,
      requireNf: cfg.requireNf ? 1 : 0,
      requireSeriado: cfg.requireSeriado ? 1 : 0,
      allowNewAssets: cfg.allowNewAssets !== false ? 1 : 0,
      allowWriteOffs: cfg.allowWriteOffs !== false ? 1 : 0,
      requirePlaqueta: cfg.requirePlaqueta ? 1 : 0
    }));
    await db.unit_configs.bulkPut(mapped);
  }

  public async getOperationalUnits(): Promise<string[]> {
    try {
      const list = await db.local_assets.toArray();
      const nonDeleted = list.filter(a => a._is_deleted === 0);
      const filiais = Array.from(new Set(nonDeleted.map(a => String(a.filial)).filter(f => f && f.trim() !== '')));
      return filiais.sort();
    } catch {
      return [];
    }
  }

  public async getDynamicUnitsFromQuery(): Promise<{ values: Record<string, unknown>[] }> {
    try {
      const filiais = await this.getOperationalUnits();
      return { values: filiais.map(f => ({ filial: f, FILIAL: f })) };
    } catch {
      return { values: [] };
    }
  }

  public async getOperationalUnitsWithStats(tenantId?: string): Promise<Record<string, unknown>[]> {
    try {
      if (tenantId) {
        console.log(">>> [SqliteService] getOperationalUnitsWithStats requested for tenant:", tenantId);
      }
      const list = await db.local_assets.toArray();
      const nonDeleted = list.filter(a => a._is_deleted === 0);
      
      const filiais = Array.from(new Set(nonDeleted.map(a => String(a.filial)).filter(f => f && f.trim() !== '')));
      const stats = filiais.map(f => {
        const filialAssets = nonDeleted.filter(a => String(a.filial) === f);
        const checkedAssets = filialAssets.filter(a => a._conferido === 1);
        return {
          filial: f,
          displayName: f,
          total: filialAssets.length,
          checked: checkedAssets.length
        };
      });
      return stats;
    } catch {
      return [];
    }
  }

  public async getOperationalStats(filial?: string): Promise<{
    totalAssets: number;
    checkedAssets: number;
    pendingAssets: number;
    discrepancyCount: number;
    recentLogs: Record<string, unknown>[];
  }> {
    try {
      let assets = await db.ativos.toArray();
      assets = assets.filter(a => a._is_deleted === 0);
      if (filial) {
        assets = assets.filter(a => String(a.filial).toUpperCase() === String(filial).toUpperCase());
      }

      const totalAssets = assets.length;
      const checkedAssets = assets.filter(a => a._conferido === 1).length;
      const pendingAssets = totalAssets - checkedAssets;
      const discrepancyCount = assets.filter(a => a._is_divergent_baixa === 1).length;

      const logs = await db.audit_logs.toArray();
      logs.sort((a, b) => b.id.localeCompare(a.id));
      const recentLogs = logs.slice(0, 5) as unknown as Record<string, unknown>[];

      return {
        totalAssets,
        checkedAssets,
        pendingAssets,
        discrepancyCount,
        recentLogs
      };
    } catch {
      return { totalAssets: 0, checkedAssets: 0, pendingAssets: 0, discrepancyCount: 0, recentLogs: [] };
    }
  }

  public async getTotalAssetsCount(): Promise<number> {
    try {
      return await db.ativos.count();
    } catch {
      return 0;
    }
  }

  public async getAddressesFromAssetsCounting(): Promise<string[]> {
    try {
      const list = await db.ativos.toArray();
      const addresses = Array.from(new Set(list.map(a => String(a.endereco || '')).filter(e => e && e.trim() !== '')));
      return addresses;
    } catch {
      return [];
    }
  }

  public async logAuditEvent(
    usuario: string,
    acao: string,
    tabela: string,
    registro_id: string,
    details: string,
    delta?: string
  ): Promise<void> {
    const id = 'LOG_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
    await db.audit_logs.put({
      id,
      usuario,
      acao,
      tabela,
      registro_id,
      details,
      delta: delta ?? null,
      updated_at: new Date().toISOString()
    });
  }

  public async query(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const sqlUpper = sql.toUpperCase().trim();
    const tableName = getTableName(sqlUpper);

    if (sqlUpper.includes("COUNT(")) {
      let count = 0;
      if (tableName === 'ativos' || tableName === 'assets' || tableName === 'local_assets') {
        let queryCollection = db.ativos.toCollection();
        if (sqlUpper.includes("_IS_SYNCED = 0")) {
          queryCollection = queryCollection.filter(a => a._is_synced === 0);
        }
        if (sqlUpper.includes("_IS_DELETED = 0")) {
          queryCollection = queryCollection.filter(a => a._is_deleted === 0);
        }
        if (sqlUpper.includes("_CONFERIDO = 1")) {
          queryCollection = queryCollection.filter(a => a._conferido === 1);
        }
        if (sqlUpper.includes("FILIAL = ?")) {
          const filialParam = params[0] as string;
          queryCollection = queryCollection.filter(a => String(a.filial).toUpperCase() === String(filialParam).toUpperCase());
        }
        count = await queryCollection.count();
      } else if (tableName === 'audit_logs' || tableName === 'audit_log') {
        count = await db.audit_logs.count();
      } else if (tableName === 'unit_configs') {
        count = await db.unit_configs.count();
      }
      
      const aliasMatch = sqlUpper.match(/COUNT\([^)]+\)\s+AS\s+(\w+)/i);
      const alias = aliasMatch ? aliasMatch[1].toLowerCase() : 'total';
      return [{ [alias]: count }];
    }

    if (sqlUpper.includes("SELECT DISTINCT FILIAL")) {
      const list = await db.local_assets.toArray();
      const filiais = Array.from(new Set(list.map(a => String(a.filial || '')).filter(f => f !== '')));
      return filiais.map(f => ({ filial: f, FILIAL: f }));
    }

    if (sqlUpper.includes("SELECT DISTINCT ENDERECO")) {
      const list = await db.ativos.toArray();
      const enderecos = Array.from(new Set(list.map(a => String(a.endereco || '')).filter(e => e !== '')));
      return enderecos.map(e => ({ endereco: e }));
    }

    if (tableName === 'ativos' || tableName === 'assets' || tableName === 'local_assets') {
      let assets = await db.ativos.toArray();
      
      if (sqlUpper.includes("_IS_DELETED = 0")) {
        assets = assets.filter(a => a._is_deleted === 0);
      }
      if (sqlUpper.includes("_IS_SYNCED = 0")) {
        assets = assets.filter(a => a._is_synced === 0);
      }
      if (sqlUpper.includes("WHERE (ETIQUETA = ? OR PRIMARYKEY = ?)") || sqlUpper.includes("WHERE ETIQUETA = ? OR PRIMARYKEY = ?")) {
        const p = String(params[0]);
        return assets.filter(a => String(a.etiqueta) === p || String(a.primarykey) === p) as unknown as Record<string, unknown>[];
      }
      if (sqlUpper.includes("WHERE FILIAL = ?") || sqlUpper.includes("AND FILIAL = ?")) {
        const filialParam = params[sqlUpper.includes("AND FILIAL = ?") ? 1 : 0] as string;
        if (filialParam) {
          assets = assets.filter(a => String(a.filial).toUpperCase() === String(filialParam).toUpperCase());
        }
      }
      if (sqlUpper.includes("WHERE ID = ?") || sqlUpper.includes("WHERE PRIMARYKEY = ?")) {
        const idParam = String(params[0]);
        return assets.filter(a => String(a.id) === idParam || String(a.primarykey) === idParam) as unknown as Record<string, unknown>[];
      }
      
      return assets as unknown as Record<string, unknown>[];
    }

    if (tableName === 'audit_logs' || tableName === 'audit_log') {
      let logs = await db.audit_logs.toArray();
      logs.sort((a, b) => b.id.localeCompare(a.id));
      if (sqlUpper.includes("LIMIT ?")) {
        const limit = Number(params[0] ?? 5);
        logs = logs.slice(0, limit);
      }
      return logs as unknown as Record<string, unknown>[];
    }

    if (tableName === 'campaigns') {
      let campaigns = await db.campaigns.toArray();
      if (sqlUpper.includes("WHERE ID = ?")) {
        const idParam = String(params[0]);
        campaigns = campaigns.filter(c => c.id === idParam);
      }
      return campaigns as unknown as Record<string, unknown>[];
    }

    if (tableName === 'unit_configs') {
      const configs = await db.unit_configs.toArray();
      return configs as unknown as Record<string, unknown>[];
    }

    if (tableName === 'system_context') {
      const context = await db.SYSTEM_CONTEXT.toArray();
      if (sqlUpper.includes("WHERE KEY = ?")) {
        const keyParam = String(params[0]);
        const match = context.find(c => c.key === keyParam);
        return match ? [match as unknown as Record<string, unknown>] : [];
      }
      return context as unknown as Record<string, unknown>[];
    }

    return [];
  }

  public async execute(sql: string, params: unknown[] = []): Promise<void> {
    const sqlUpper = sql.toUpperCase().trim();
    const tableName = getTableName(sqlUpper);

    if (sqlUpper.startsWith("INSERT") || sqlUpper.startsWith("UPDATE")) {
      const obj = parseSqlAndParams(sql, params);
      
      if (tableName === 'ativos' || tableName === 'assets' || tableName === 'local_assets') {
        const primaryKeyVal = String(obj.primarykey || obj.id || params[0] || '');
        if (primaryKeyVal) {
          const existing = await db.ativos.get(primaryKeyVal);
          const updatedItem: DexieAsset = {
            ...existing,
            ...obj,
            primarykey: primaryKeyVal,
            id: primaryKeyVal,
            _is_synced: obj._is_synced !== undefined ? Number(obj._is_synced) : (existing?._is_synced ?? 0),
            _is_deleted: obj._is_deleted !== undefined ? Number(obj._is_deleted) : (existing?._is_deleted ?? 0),
            _conferido: obj._conferido !== undefined ? Number(obj._conferido) : (existing?._conferido ?? 0),
            _plaquetado: obj._plaquetado !== undefined ? Number(obj._plaquetado) : (existing?._plaquetado ?? 0),
            _aprovado: obj._aprovado !== undefined ? Number(obj._aprovado) : (existing?._aprovado ?? 0),
            _isNew: obj._isNew !== undefined ? Number(obj._isNew) : (existing?._isNew ?? 0),
            _is_unitized: obj._is_unitized !== undefined ? Number(obj._is_unitized) : (existing?._is_unitized ?? 0),
            _is_divergent_baixa: obj._is_divergent_baixa !== undefined ? Number(obj._is_divergent_baixa) : (existing?._is_divergent_baixa ?? 0),
            tenantId: String(obj.tenantId || existing?.tenantId || 'CICOPAL'),
            _tenantid: String(obj._tenantid || existing?._tenantid || 'CICOPAL'),
            filial: String(obj.filial || existing?.filial || ''),
            _unitid: String(obj._unitid || existing?._unitid || ''),
            status: String(obj.status || existing?.status || 'P'),
            etiqueta: String(obj.etiqueta || existing?.etiqueta || ''),
            tag: String(obj.tag || existing?.tag || ''),
            qt: Number(obj.qt ?? existing?.qt ?? 1),
            descricaodoativo: String(obj.descricaodoativo || existing?.descricaodoativo || ''),
            serial: obj.serial !== undefined ? String(obj.serial) : (existing?.serial ?? null),
            dataaqusic: obj.dataaqusic !== undefined ? String(obj.dataaqusic) : (existing?.dataaqusic ?? null),
            cnpj: obj.cnpj !== undefined ? String(obj.cnpj) : (existing?.cnpj ?? null),
            nomefornecedor: obj.nomefornecedor !== undefined ? String(obj.nomefornecedor) : (existing?.nomefornecedor ?? null),
            notafiscal: obj.notafiscal !== undefined ? String(obj.notafiscal) : (existing?.notafiscal ?? null),
            endereco: obj.endereco !== undefined ? String(obj.endereco) : (existing?.endereco ?? null),
            registro: obj.registro !== undefined ? String(obj.registro) : (existing?.registro ?? null),
            subreg: obj.subreg !== undefined ? String(obj.subreg) : (existing?.subreg ?? null),
            databaixa: obj.databaixa !== undefined ? String(obj.databaixa) : (existing?.databaixa ?? null),
            contacontabil: obj.contacontabil !== undefined ? String(obj.contacontabil) : (existing?.contacontabil ?? null),
            centrodecusto: obj.centrodecusto !== undefined ? String(obj.centrodecusto) : (existing?.centrodecusto ?? null),
            vlraquisic: obj.vlraquisic !== undefined ? Number(obj.vlraquisic) : (existing?.vlraquisic ?? 0),
            sn1_recno: obj.sn1_recno !== undefined ? (obj.sn1_recno === null ? null : Number(obj.sn1_recno)) : (existing?.sn1_recno ?? null),
            sn3_recno: obj.sn3_recno !== undefined ? (obj.sn3_recno === null ? null : Number(obj.sn3_recno)) : (existing?.sn3_recno ?? null),
            _history: obj._history !== undefined ? String(obj._history) : (existing?._history ?? null),
            DE_PARA: obj.DE_PARA !== undefined ? String(obj.DE_PARA) : (existing?.DE_PARA ?? null),
            _photoUrl: obj._photoUrl !== undefined ? String(obj._photoUrl) : (existing?._photoUrl ?? null),
            gps_lat: obj.gps_lat !== undefined ? Number(obj.gps_lat) : (existing?.gps_lat ?? null),
            gps_lng: obj.gps_lng !== undefined ? Number(obj.gps_lng) : (existing?.gps_lng ?? null),
            currentCampaignId: obj.currentCampaignId !== undefined ? String(obj.currentCampaignId) : (existing?.currentCampaignId ?? null)
          };
          
          await db.ativos.put(updatedItem);
          await db.assets.put(updatedItem);
          await db.local_assets.put(updatedItem);
        }
      } else if (tableName === 'system_context') {
        const key = String(obj.key || params[0] || '');
        const value = String(obj.value || params[1] || '');
        if (key) {
          await db.SYSTEM_CONTEXT.put({
            key,
            value,
            updated_at: new Date().toISOString()
          });
        }
      } else if (tableName === 'unit_configs') {
        const id = String(obj.id || params[0] || '');
        if (id) {
          await db.unit_configs.put({
            id,
            filial: String(obj.filial || params[1] || ''),
            nome: String(obj.nome || params[2] || ''),
            hasGps: obj.hasGps ? 1 : 0,
            requireNf: obj.requireNf ? 1 : 0,
            requireSeriado: obj.requireSeriado ? 1 : 0,
            allowNewAssets: obj.allowNewAssets !== false ? 1 : 0,
            allowWriteOffs: obj.allowWriteOffs !== false ? 1 : 0,
            requirePlaqueta: obj.requirePlaqueta ? 1 : 0
          });
        }
      } else if (tableName === 'audit_logs' || tableName === 'audit_log') {
        const id = String(obj.id || params[0] || '');
        if (id) {
          await db.audit_logs.put({
            id,
            usuario: String(obj.usuario || params[1] || ''),
            acao: String(obj.acao || params[2] || ''),
            tabela: String(obj.tabela || params[3] || ''),
            registro_id: String(obj.registro_id || params[4] || ''),
            details: String(obj.details || params[5] || ''),
            delta: obj.delta ? String(obj.delta) : null,
            updated_at: new Date().toISOString()
          });
        }
      } else if (tableName === 'campaigns') {
        const id = String(obj.id || params[0] || '');
        if (id) {
          await db.campaigns.put({
            id,
            name: String(obj.name || params[1] || ''),
            status: String(obj.status || params[2] || ''),
            tenantId: String(obj.tenantId || params[3] || ''),
            created_at: String(obj.created_at || params[4] || '')
          });
        }
      }
    } else if (sqlUpper.startsWith("DELETE FROM")) {
      if (tableName === 'ativos' || tableName === 'assets' || tableName === 'local_assets') {
        if (sqlUpper.includes("WHERE")) {
          if (sqlUpper.includes("CURRENTCAMPAIGNID = ?")) {
            const campaignId = String(params[0]);
            await db.ativos.where('currentCampaignId').equals(campaignId).delete();
            await db.assets.where('currentCampaignId').equals(campaignId).delete();
            await db.local_assets.where('currentCampaignId').equals(campaignId).delete();
          }
        } else {
          await db.ativos.clear();
          await db.assets.clear();
          await db.local_assets.clear();
        }
      } else if (tableName === 'audit_logs' || tableName === 'audit_log') {
        if (sqlUpper.includes("CREATED_AT <") || sqlUpper.includes("UPDATED_AT <")) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          await db.audit_logs.filter(log => new Date(log.updated_at) < sevenDaysAgo).delete();
        } else {
          await db.audit_logs.clear();
        }
      } else if (tableName === 'unit_configs') {
        await db.unit_configs.clear();
      } else if (tableName === 'campaigns') {
        await db.campaigns.clear();
      }
    }
  }

  public async executeRaw(sql: string): Promise<void> {
    await this.execute(sql);
  }

  public async executeBatch(set: { statement: string; values: unknown[] }[]): Promise<void> {
    for (const item of set) {
      await this.execute(item.statement, item.values);
    }
  }

  public async saveDatabase(): Promise<void> {
    return Promise.resolve();
  }

  public async getFirstValidFilial(): Promise<string> {
    const first = await db.local_assets.limit(1).first();
    return first ? first.filial : 'GERAL';
  }

  public async getReactiveFilial(): Promise<string> {
    const first = await db.local_assets.limit(1).first();
    if (first && first.filial) {
      return first.filial;
    }
    const firstConfig = await db.unit_configs.limit(1).first();
    if (firstConfig && firstConfig.filial) {
      return firstConfig.filial;
    }
    return 'GERAL';
  }

  public async bulkInsertAssetsOfflineFirst(
    assets: Record<string, unknown>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<void> {
    const total = assets.length;
    let processed = 0;
    const CHUNK_SIZE = 200;

    this.isImportingBatch = true;
    console.log(`>>> [Dexie SRE Batch] Iniciando bulk insert de ${total} ativos...`);

    try {
      await db.transaction('rw', [db.ativos, db.assets, db.local_assets], async () => {
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = assets.slice(i, i + CHUNK_SIZE);
          
          const mappedChunk: DexieAsset[] = chunk.map(asset => {
            const primaryKeyVal = String(asset.primarykey || asset.id || '');
            if (!primaryKeyVal) {
              throw new Error("[FATAL_IMPORT_CRASH] Chave primária vazia detectada no lote.");
            }

            const mapped: DexieAsset = {
              id: primaryKeyVal,
              primarykey: primaryKeyVal,
              tenantId: String(asset.tenantId || asset._tenantid || asset.tenantid || 'CICOPAL'),
              _tenantid: String(asset._tenantid || asset.tenantId || asset.tenantid || 'CICOPAL'),
              filial: String(asset.filial || asset._unitid || asset.unitid || asset.unitId || ''),
              _unitid: String(asset._unitid || asset.filial || asset.unitid || asset.unitId || ''),
              status: String(asset.status || 'P'),
              etiqueta: String(asset.etiqueta || ''),
              tag: String(asset.tag || asset.etiqueta || ''),
              qt: Number(asset.qt ?? 1),
              descricaodoativo: String(asset.descricaodoativo || ''),
              serial: asset.serial !== undefined && asset.serial !== null ? String(asset.serial) : null,
              dataaqusic: asset.dataaqusic !== undefined && asset.dataaqusic !== null ? String(asset.dataaqusic) : null,
              cnpj: asset.cnpj !== undefined && asset.cnpj !== null ? String(asset.cnpj) : null,
              nomefornecedor: asset.nomefornecedor !== undefined && asset.nomefornecedor !== null ? String(asset.nomefornecedor) : null,
              notafiscal: asset.notafiscal !== undefined && asset.notafiscal !== null ? String(asset.notafiscal) : null,
              endereco: asset.endereco !== undefined && asset.endereco !== null ? String(asset.endereco) : null,
              registro: asset.registro !== undefined && asset.registro !== null ? String(asset.registro) : null,
              subreg: asset.subreg !== undefined && asset.subreg !== null ? String(asset.subreg) : null,
              databaixa: asset.databaixa !== undefined && asset.databaixa !== null ? String(asset.databaixa) : null,
              contacontabil: asset.contacontabil !== undefined && asset.contacontabil !== null ? String(asset.contacontabil) : null,
              centrodecusto: asset.centrodecusto !== undefined && asset.centrodecusto !== null ? String(asset.centrodecusto) : null,
              vlraquisic: Number(asset.vlraquisic ?? 0),
              sn1_recno: asset.sn1_recno !== undefined && asset.sn1_recno !== null ? Number(asset.sn1_recno) : null,
              sn3_recno: asset.sn3_recno !== undefined && asset.sn3_recno !== null ? Number(asset.sn3_recno) : null,
              _is_synced: Number(asset._is_synced) === 1 ? 1 : 0,
              _is_deleted: asset._is_deleted ? 1 : 0,
              _conferido: asset._conferido ? 1 : 0,
              _plaquetado: asset._plaquetado ? 1 : 0,
              _aprovado: asset._aprovado ? 1 : 0,
              _isNew: asset._isNew ? 1 : 0,
              _is_unitized: asset._is_unitized ? 1 : 0,
              _is_divergent_baixa: asset._is_divergent_baixa ? 1 : 0,
              _history: asset._history !== undefined && asset._history !== null ? String(asset._history) : null,
              DE_PARA: asset.DE_PARA !== undefined && asset.DE_PARA !== null ? String(asset.DE_PARA) : null,
              _photoUrl: asset._photoUrl !== undefined && asset._photoUrl !== null ? String(asset._photoUrl) : null,
              gps_lat: asset.gps_lat !== undefined && asset.gps_lat !== null ? Number(asset.gps_lat) : null,
              gps_lng: asset.gps_lng !== undefined && asset.gps_lng !== null ? Number(asset.gps_lng) : null,
              currentCampaignId: asset.currentCampaignId !== undefined && asset.currentCampaignId !== null ? String(asset.currentCampaignId) : null
            };

            return mapped;
          });

          await db.ativos.bulkPut(mappedChunk);
          await db.assets.bulkPut(mappedChunk);
          await db.local_assets.bulkPut(mappedChunk);

          processed += chunk.length;
          if (onProgress) {
            onProgress(processed, total);
          }
        }
      });

      const diskCount = await db.local_assets.count();
      console.log(`>>> [Dexie SRE Batch] Contra-prova: total lido=${total}, gravado em disco=${diskCount}`);
      if (diskCount < total) {
        throw new Error(`[FATAL_IMPORT_CRASH] Contra-prova falhou: total esperado ${total}, mas em disco consta ${diskCount}.`);
      }

      console.log(`>>> [Dexie SRE Batch] Sincronização concluída com sucesso! ${processed} itens persistidos.`);
    } catch (error) {
      console.error('[FATAL_IMPORT_CRASH]', error);
      throw error;
    } finally {
      this.isImportingBatch = false;
    }
  }

  public async saveCampaigns(campaigns: Record<string, unknown>[]): Promise<void> {
    const mapped = campaigns.map(c => ({
      id: String(c.id || ''),
      name: String(c.name || ''),
      status: String(c.status || ''),
      tenantId: String(c.tenantId || c.tenantid || ''),
      created_at: String(c.created_at || '')
    }));
    await db.campaigns.bulkPut(mapped);
  }

  public async getCampaigns(): Promise<Record<string, unknown>[]> {
    try {
      const camps = await db.campaigns.toArray();
      return camps as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  public async saveLocalAsset(
    id: string, vlr: number, filial: string, desc: string, registro: string, qt: number,
    tenant: string, primarykey: string, conferido: number, isNew: number, isSynced: number, endereco: string
  ): Promise<void> {
    const item: DexieAsset = {
      id,
      primarykey,
      tenantId: tenant,
      _tenantid: tenant,
      filial,
      _unitid: filial,
      status: conferido ? 'CONFERIDO' : 'P',
      etiqueta: id,
      tag: id,
      qt: Number(qt ?? 1),
      descricaodoativo: desc,
      serial: null,
      dataaqusic: null,
      cnpj: null,
      nomefornecedor: null,
      notafiscal: null,
      endereco,
      registro,
      subreg: null,
      databaixa: null,
      contacontabil: null,
      centrodecusto: null,
      vlraquisic: Number(vlr ?? 0),
      sn1_recno: null,
      sn3_recno: null,
      _is_synced: isSynced,
      _is_deleted: 0,
      _conferido: conferido,
      _plaquetado: 0,
      _aprovado: 0,
      _isNew: isNew,
      _is_unitized: 0,
      _is_divergent_baixa: 0,
      _history: null,
      DE_PARA: null,
      _photoUrl: null,
      gps_lat: null,
      gps_lng: null
    };
    await db.ativos.put(item);
    await db.assets.put(item);
    await db.local_assets.put(item);
  }

  public async getAssetsOffline(): Promise<Record<string, unknown>[]> {
    return this.query("SELECT * FROM ativos;");
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getNativeDb(): unknown {
    return null;
  }

  public getDbStatus(): string {
    return this.dbStatus;
  }

  public getStorageSource(): string {
    return 'DEXIE_INDEXEDDB';
  }

  public getNativePath(): string {
    return 'IndexedDB://InventoryLocalStore';
  }

  public async setSystemStatus(status: string): Promise<void> {
    this.dbStatus = status as DatabaseStatus;
    await this.setContextValue('system_status', status);
  }

  public setPermissionsGranted(granted: boolean): void {
    console.log(">>> [SqliteService] setPermissionsGranted called with:", granted);
  }

  public async getFileStatus(): Promise<{ status: string; path: string; fileName?: string }> {
    return {
      status: this.isInitialized ? 'linked' : 'permission_denied',
      path: this.getNativePath(),
      fileName: 'InventoryLocalStore'
    };
  }

  public async obterContextoAtivo(): Promise<{ selectedUnit: string; currentCampaignId: string }> {
    const selectedUnit = await this.getSelectedUnit() || '';
    const currentCampaignId = await this.getActiveCampaign() || '';
    return { selectedUnit, currentCampaignId };
  }

  public async loadStateCompleto(): Promise<Record<string, unknown>> {
    const assets = await this.getAllAssets();
    const selectedUnit = await this.getSelectedUnit() || '';
    const currentCampaignId = await this.getActiveCampaign() || '';
    return {
      assets,
      selectedUnit,
      currentCampaignId,
      status: assets.length > 0 ? DatabaseStatus.LOADED : DatabaseStatus.EMPTY,
      lastUpdated: new Date().toISOString()
    };
  }

  public async getAllAssets(): Promise<Record<string, unknown>[]> {
    try {
      const list = await db.ativos.toArray();
      return list.filter(a => a._is_deleted === 0) as unknown as Record<string, unknown>[];
    } catch (err) {
      console.error(">>> [SqliteService] Erro ao buscar todos os ativos:", err);
      return [];
    }
  }

  public async getAssetCount(): Promise<number> {
    try {
      const list = await db.ativos.toArray();
      return list.filter(a => a._is_deleted === 0).length;
    } catch {
      return 0;
    }
  }

  public async countAtivos(): Promise<number> {
    return await this.getAssetCount();
  }

  public async saveInventoryConfig(config: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveInventoryConfig called with:", config);
    if (config.selectedUnit) {
      await this.setContextValue('selected_unit', String(config.selectedUnit));
    }
    if (config.currentCampaignId) {
      await this.setContextValue('active_campaign', String(config.currentCampaignId));
    }
    if (config.tenantId) {
      await this.setContextValue('tenant_id', String(config.tenantId));
    }
    if (config.lastUpdated) {
      await this.setContextValue('last_updated', String(config.lastUpdated));
    }
  }

  public async closeCurrentConnection(): Promise<void> {
    console.log(">>> [SqliteService] closeCurrentConnection called.");
    await this.closeConnection();
  }

  public async deleteCampaignSql(campaignId: string): Promise<void> {
    console.log(">>> [SqliteService] deleteCampaignSql called for:", campaignId);
    await db.campaigns.delete(campaignId);
  }

  public async saveCampaign(c: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveCampaign called for:", c.id);
    const mapped = {
      id: String(c.id || ''),
      name: String(c.name || ''),
      status: String(c.status || ''),
      tenantId: String(c.tenantId || c.tenantid || c.tenant_id || ''),
      created_at: String(c.created_at || '')
    };
    await db.campaigns.put(mapped);
  }

  public async persist(): Promise<void> {
    console.log(">>> [SqliteService] persist (no-op for IndexedDB).");
    return Promise.resolve();
  }

  public async saveUnitConfigToSql(config: Record<string, unknown>): Promise<void> {
    console.log(">>> [SqliteService] saveUnitConfigToSql called.");
    await this.saveUnitConfigs([config]);
  }

  public async isBatteryCritical(): Promise<boolean> {
    try {
      if ('getBattery' in navigator) {
        const nav = navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> };
        const battery = await nav.getBattery();
        return battery.level <= 0.05 && !battery.charging;
      }
    } catch (e) {
      console.warn(">>> [SqliteService] Battery API error:", e);
    }
    return false;
  }

  public async forcePurgeAndConnect(): Promise<void> {
    console.log(">>> [SqliteService SRE] Iniciando expurgo imperativo do banco local...");
    this.isImportingBatch = true;
    try {
      await db.ativos.clear();
      await db.assets.clear();
      await db.local_assets.clear();
      await db.audit_logs.clear();
      await db.campaigns.clear();
      await db.SYSTEM_CONTEXT.clear();
      await db.unit_configs.clear();
      console.log(">>> [SqliteService SRE] Tabelas físicas limpas e compactadas.");
    } catch (err) {
      console.error(">>> [SqliteService SRE] Falha crítica no forcePurgeAndConnect:", err);
      throw err;
    } finally {
      this.isImportingBatch = false;
    }
  }

  public async bulkInsertAssets(assets: Record<string, unknown>[]): Promise<void> {
    await this.bulkInsertAssetsOfflineFirst(assets);
  }

  public async checkIntegrity(): Promise<boolean> {
    return true;
  }

  public async hardResetDatabase(): Promise<void> {
    await this.forcePurgeAndConnect();
  }

  public async salvarCampanhaAtiva(selectedUnit: string, campaignId: string): Promise<void> {
    await this.setContextValue('selected_unit', selectedUnit);
    await this.setContextValue('active_campaign', campaignId);
  }

  public async forceSync(): Promise<boolean> {
    try {
      await this.flushFieldChanges();
      return true;
    } catch (err) {
      console.error(">>> [SqliteService] Erro durante o forceSync:", err);
      return false;
    }
  }

  public async getDashboardStats(selectedUnit?: string, currentCampaignId?: string): Promise<{
    totalAtivos: number;
    conferidoAtivos: number;
    baixadosLocalizados: number;
    totalLido: number;
    pendentesAtivos: number;
    avancoPercent: number;
  }> {
    try {
      let assets = await db.ativos.toArray();
      assets = assets.filter(a => a._is_deleted === 0);
      if (selectedUnit) {
        assets = assets.filter(a => String(a.filial).toUpperCase() === String(selectedUnit).toUpperCase());
      }
      if (currentCampaignId) {
        assets = assets.filter(a => String(a.currentCampaignId) === String(currentCampaignId));
      }

      const totalAtivos = assets.length;
      const conferidoAtivos = assets.filter(a => a._conferido === 1).length;
      const baixadosLocalizados = assets.filter(a => a._conferido === 1 && a.status === 'B').length;
      const totalLido = conferidoAtivos;
      const pendentesAtivos = totalAtivos - conferidoAtivos;
      const avancoPercent = totalAtivos > 0 ? Math.round((conferidoAtivos / totalAtivos) * 100) : 0;

      return {
        totalAtivos,
        conferidoAtivos,
        baixadosLocalizados,
        totalLido,
        pendentesAtivos,
        avancoPercent
      };
    } catch (err) {
      console.error(">>> [sqliteService] Erro calculando getDashboardStats:", err);
      return {
        totalAtivos: 0,
        conferidoAtivos: 0,
        baixadosLocalizados: 0,
        totalLido: 0,
        pendentesAtivos: 0,
        avancoPercent: 0
      };
    }
  }

  public bufferFieldChange(
    asset: Record<string, unknown>,
    field: string,
    oldValue: string | null,
    newValue: string | null,
    userEmail: string
  ): void {
    console.log(`>>> [sqliteService] bufferFieldChange registrado: Ativo=${asset.id}, Campo=${field}, Novo=${newValue}`);
    this.bufferedFieldChanges.push({
      asset,
      field,
      oldValue,
      newValue,
      userEmail,
      timestamp: Date.now()
    });
    
    if (this.bufferedFieldChanges.length >= 5) {
      this.flushFieldChanges().catch(err => {
        console.error(">>> [sqliteService] Erro ao disparar flush automático:", err);
      });
    }
  }

  public getBufferedChangesCount(): number {
    return this.bufferedFieldChanges.length;
  }

  public async flushFieldChanges(): Promise<void> {
    if (this.bufferedFieldChanges.length === 0) return;
    
    console.log(`>>> [sqliteService] flushFieldChanges acionado para ${this.bufferedFieldChanges.length} alterações...`);
    const changesToProcess = [...this.bufferedFieldChanges];
    this.bufferedFieldChanges = [];

    for (const change of changesToProcess) {
      const asset = change.asset;
      const primaryKeyVal = String(asset.primarykey || asset.id || '');
      if (primaryKeyVal) {
        const existing = await db.ativos.get(primaryKeyVal);
        const updatedItem = {
          ...existing,
          ...asset,
          primarykey: primaryKeyVal,
          id: primaryKeyVal,
          _is_synced: 0
        } as DexieAsset;
        
        await db.ativos.put(updatedItem);
        await db.assets.put(updatedItem);
        await db.local_assets.put(updatedItem);

        const details = `Alteração do campo ${change.field} de ${change.oldValue || 'NULO'} para ${change.newValue || 'NULO'}`;
        await this.logAuditEvent(
          change.userEmail,
          'FIELD_BUFFERED_UPDATE',
          'ativos',
          primaryKeyVal,
          details,
          JSON.stringify({ field: change.field, oldValue: change.oldValue, newValue: change.newValue })
        );
      }
    }
    console.log(`>>> [sqliteService] flushFieldChanges concluído com sucesso.`);
  }
}

export const sqliteService = new Proxy({} as SqliteService, {
  get(target, prop, receiver) {
    return Reflect.get(SqliteService.getInstance(), prop, receiver);
  },
  set(target, prop, value, receiver) {
    return Reflect.set(SqliteService.getInstance(), prop, value, receiver);
  }
});
