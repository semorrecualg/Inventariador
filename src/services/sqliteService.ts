import initSqlJs, { Database } from 'sql.js';
import { Filesystem, Directory } from '@capacitor/filesystem';

class SqliteService {
  private db: Database | null = null;
  private changeCounter: number = 0;
  private readonly DB_NAME = 'gbr_kardek_v24.db';

  async initDB(binaryData?: Uint8Array) {
    console.log('[GBR-Boot] Solicitando initSqlJs...');
    
    // Motor WASM do sql.js via CDN otimizada
    const SQL = await initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
    });

    if (binaryData) {
      // Pre-flight check: Validar cabeçalho SQLite 'SQLite format 3'
      try {
        const header = new TextDecoder().decode(binaryData.subarray(0, 15));
        if (header !== "SQLite format 3") {
          console.error("[GBR-Preflight] Arquivo corrompido ou inválido detectado.");
          throw new Error("Arquivo carregado não é um banco de dados SQLite válido.");
        }
        this.db = new SQL.Database(binaryData);
        console.log('[GBR-Preflight] Snapshot externo validado e carregado.');
      } catch (err) {
        console.error("[GBR-Preflight] Falha crítica na validação do header:", err);
        throw err;
      }
    } else {
      // Tenta carregar do Filesystem Nativo (Capacitor) com fallback inteligente para Web
      try {
        console.log('[GBR-Boot] Verificando armazenamento nativo...');
        const file = await Filesystem.readFile({
          path: this.DB_NAME,
          directory: Directory.Data
        });
        
        // Conversão segura de base64 para Uint8Array
        const binaryString = atob(file.data as string);
        const uint8Array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          uint8Array[i] = binaryString.charCodeAt(i);
        }
        
        this.db = new SQL.Database(uint8Array);
        console.log('[GBR-Boot] Banco de dados nativo restaurado com sucesso.');
      } catch (e) {
        // [GBR-Soberania] Fallback para Modo Volátil em ambiente Sandbox ou Web
        console.warn("[GBR-Soberania] Modo Volátil Ativado: Banco de dados em branco iniciado (Web/Sandbox).", e);
        this.db = new SQL.Database();
      }
    }

    // Initialize Schema fundamental para GBR
    this.db.run(`
      CREATE TABLE IF NOT EXISTS assets (
        _uuid TEXT PRIMARY KEY,
        _origemTransacao INTEGER,
        _status_sinc INTEGER,
        SN1_RECNO INTEGER,
        SN3_RECNO INTEGER,
        C_CODIGO TEXT,
        C_DESCRICAO TEXT,
        C_STATUS_AUDIT TEXT,
        N1_DESCRIC TEXT,
        N3_CONTA TEXT,
        N3_CCONTAB TEXT,
        C_FILIAL TEXT,
        C_GRUPO TEXT,
        C_BAIXADO INTEGER
      );
    `);
  }

  isInitialized() {
    return this.db !== null;
  }

  async saveIncremental() {
    this.changeCounter++;
    if (this.changeCounter >= 5) {
      await this.persistToDisk();
      this.changeCounter = 0;
    }
  }

  async persistToDisk() {
    if (!this.db) return;
    try {
      const data = this.db.export();
      
      // Técnica de Chunking para evitar 'Maximum call stack size exceeded' em bancos > 10MB
      const uint8ToB64 = (buffer: Uint8Array): string => {
        let binary = '';
        const len = buffer.byteLength;
        const CHUNK_SIZE = 8192; // 8KB chunks seguros para stack
        for (let i = 0; i < len; i += CHUNK_SIZE) {
          const part = buffer.subarray(i, i + CHUNK_SIZE);
          binary += String.fromCharCode.apply(null, Array.from(part));
        }
        return btoa(binary);
      };

      const base64 = uint8ToB64(data);

      await Filesystem.writeFile({
        path: this.DB_NAME,
        data: base64,
        directory: Directory.Data,
        recursive: true
      });
      console.log('[GBR-Soberania] Persistência atômica chunked concluída.');
    } catch (err) {
      console.error("[GBR-Soberania] Falha na persistência nativa (Estou no Web Preview):", err);
    }
  }

  executeQuery(sql: string, params?: any[]) {
    if (!this.db) throw new Error("DB_NOT_INITIALIZED");
    return this.db.exec(sql, params);
  }
}

export const sqliteService = new SqliteService();
