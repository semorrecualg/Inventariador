
import initSqlJs, { Database, SqlValue } from 'sql.js';

// Configuração de Migrations (CPC 27 Compliance)
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS assets (
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
    _localMaster INTEGER DEFAULT 0,
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
  );`,
  // Migrations para bancos existentes
  `ALTER TABLE assets ADD COLUMN GRUPO_EMPRESARIAL TEXT;`,
  `ALTER TABLE assets ADD COLUMN UNIDADE_OPERACIONAL TEXT;`,
  `ALTER TABLE assets ADD COLUMN UNIDADE TEXT;`,
  `ALTER TABLE assets ADD COLUMN QT TEXT;`,
  `ALTER TABLE assets ADD COLUMN SERIAL TEXT;`,
  `ALTER TABLE assets ADD COLUMN CNPJ TEXT;`,
  `ALTER TABLE assets ADD COLUMN NOMEFORNECEDOR TEXT;`,
  `ALTER TABLE assets ADD COLUMN NOTAFISCAL TEXT;`,
  `ALTER TABLE assets ADD COLUMN ENDERECO TEXT;`,
  `ALTER TABLE assets ADD COLUMN SUBREG TEXT;`,
  `ALTER TABLE assets ADD COLUMN DATABAIXA TEXT;`,
  `ALTER TABLE assets ADD COLUMN PRIMARYKEY TEXT;`,
  `ALTER TABLE assets ADD COLUMN _unidade TEXT;`,
  `ALTER TABLE assets ADD COLUMN _dataLeitura TEXT;`,
  `ALTER TABLE assets ADD COLUMN _auditor TEXT;`,
  `ALTER TABLE assets ADD COLUMN _photoUrl TEXT;`,
  `ALTER TABLE assets ADD COLUMN _lat REAL;`,
  `ALTER TABLE assets ADD COLUMN _lng REAL;`,
  `ALTER TABLE assets ADD COLUMN _campaignId TEXT;`,
  `ALTER TABLE assets ADD COLUMN _version INTEGER DEFAULT 1;`,
  `ALTER TABLE assets ADD COLUMN _is_deleted INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN _plaquetado INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN _plaquetaMaster TEXT;`,
  `ALTER TABLE assets ADD COLUMN _descricaoMaster TEXT;`,
  `ALTER TABLE assets ADD COLUMN _aprovado INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN _dataAprovacao TEXT;`,
  `ALTER TABLE assets ADD COLUMN _aprovador TEXT;`,
  `ALTER TABLE assets ADD COLUMN _assinatura TEXT;`,
  `ALTER TABLE assets ADD COLUMN _isNew INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN _is_unitized INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN _is_divergent_baixa INTEGER DEFAULT 0;`,
  `ALTER TABLE assets ADD COLUMN DE_PARA TEXT;`,
  `ALTER TABLE assets ADD COLUMN AUDITOR_STATUS_CONFERENCIA TEXT;`,
  `ALTER TABLE assets ADD COLUMN _origemTransacao TEXT;`,
  `CREATE TABLE IF NOT EXISTS unit_configs (
    unit_id TEXT PRIMARY KEY,
    tenant_id TEXT,
    config_data TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    user_email TEXT,
    action TEXT,
    details TEXT,
    _tenantid TEXT
  );`
];

class SQLiteService {
  private db: Database | null = null;
  private isInitialized = false;

  async init() {
    if (this.isInitialized) return;

    const SQL = await initSqlJs({
      // Estratégia de Fallback para CDNs: Tenta jsDelivr (oficial), depois unpkg, depois sql.js.org
      locateFile: file => {
        const version = '1.14.1';
        // Usamos jsDelivr como primário pois é otimizado para NPM
        return `https://cdn.jsdelivr.net/npm/sql.js@${version}/dist/${file}`;
      }
    }).catch(async (err) => {
      console.warn(">>> [DBA] Falha no CDN Primário (jsDelivr), tentando Unpkg...", err);
      return await initSqlJs({
        locateFile: file => `https://unpkg.com/sql.js@1.14.1/dist/${file}`
      });
    }).catch(async (err) => {
      console.warn(">>> [DBA] Falha no Unpkg, tentando sql.js.org...", err);
      return await initSqlJs({
        locateFile: file => `https://sql.js.org/dist/${file}`
      });
    });

    // Tenta carregar banco existente do armazenamento persistente
    const savedDb = localStorage.getItem('app_sqlite_db');
    if (savedDb) {
      const uInt8Array = new Uint8Array(JSON.parse(savedDb));
      this.db = new SQL.Database(uInt8Array);
    } else {
      this.db = new SQL.Database();
    }

    // Executa Migrations com tratamento de erro para permitir colunas já existentes
    MIGRATIONS.forEach(sql => {
      try {
        this.db?.run(sql);
      } catch (err) {
        // Ignora erros de "column already exists" ou similares
        if (sql.includes('ALTER TABLE')) {
          // Silencioso para ALTER TABLE
        } else {
          console.warn(">>> [DBA] Erro na migration:", err, sql);
        }
      }
    });
    
    this.isInitialized = true;
    this.persist();
    console.log(">>> [DBA] SQLite Nativo (Simulado/WASM) inicializado com sucesso.");
  }

  // Persiste o estado do arquivo .db
  // Nota: Em React Native, o driver nativo faz isso automaticamente no sistema de arquivos.
  private persist() {
    if (!this.db) return;
    const data = this.db.export();
    const array = Array.from(data);
    localStorage.setItem('app_sqlite_db', JSON.stringify(array));
  }

  async execute(sql: string, params?: SqlValue[]) {
    if (!this.db) await this.init();
    const result = this.db?.run(sql, params);
    this.persist();
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

  // Função de Hard Reset Controlada (Exclusiva para Admin)
  async hardResetDatabase() {
    console.warn(">>> [DBA] Executando Hard Reset do Banco de Dados...");
    this.db = null;
    localStorage.removeItem('app_sqlite_db');
    this.isInitialized = false;
    await this.init();
  }
}

export const sqliteService = new SQLiteService();
