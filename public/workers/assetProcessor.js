
/* eslint-disable */
/**
 * Web Worker (No-Bundle) optimized for heavy Excel processing and direct SQLite writing.
 * Located in /public/workers to bypass Vite/Terser bundling.
 * Uses BroadcastChannel as an alternative communication channel to avoid postMessage serialization bottlenecks.
 */

console.log("[Worker] Top-Level Debug - self:", self);

// Load libraries from CDN inside a try-catch to detect loading issues
try {
  importScripts('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
  importScripts('https://unpkg.com/sql.js@1.14.1/dist/sql-wasm.js');
  console.log("[Worker] Bibliotecas carregadas com sucesso.");
} catch (libErr) {
  console.error("[Worker] Erro ao carregar scripts externos:", libErr);
}

// BroadcastChannel for more robust communication
var channel = new BroadcastChannel('asset_worker_channel');

var processData = async function(data) {
  var dataBuffer = data.dataBuffer;
  var dbArrayBuffer = data.dbBuffer;
  
  try {
    console.log("[Worker] Iniciando processamento via BroadcastChannel Event...");

    // 1. Initialize SQL.js
    var SQL = await initSqlJs({ 
      locateFile: function(file) { return "https://unpkg.com/sql.js@1.14.1/dist/" + file; } 
    });
    
    // 2. Load DB
    var db = dbArrayBuffer ? new SQL.Database(new Uint8Array(dbArrayBuffer)) : new SQL.Database();
    
    // 3. Read Excel with memory optimization
    var wb = XLSX.read(dataBuffer, { 
      type: 'array', 
      cellDates: true, 
      cellNF: false, 
      cellText: false,
      dense: true 
    });
    
    var wsname = wb.SheetNames[0];
    var ws = wb.Sheets[wsname];
    
    if (!ws) {
      throw new Error("Planilha não encontrada no arquivo.");
    }

    var rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    var totalRows = rawRows.length;
    
    if (totalRows <= 1) {
       throw new Error("Planilha não contém dados (apenas cabeçalho ou vazia).");
    }

    var rawHeaders = rawRows[0] || [];
    var headers = rawHeaders.map(function(h) { 
      return String(h || '').toUpperCase().trim(); 
    });
    
    var sendStatus = function(msg) {
      self.postMessage({ type: 'STATUS', msg: msg });
    };

    sendStatus("Iniciando persistência no SQLite via Worker (Streaming)...");

    // Clear existing data to avoid duplications
    db.run("DELETE FROM assets");
    console.log("[Worker] Tabela 'assets' limpa antes da carga.");

    var CHUNK_SIZE = 100;
    var processedCount = 0;
    var normalize = function(val) { 
      return (val === undefined || val === null) ? '' : String(val); 
    };

    var insertSqlValue = "INSERT OR REPLACE INTO assets ( " +
      "id, ETIQUETA, DESCRICAODOATIVO, GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, " +
      "CENTRODECUSTO, CONTACONTABIL, TAG_INVENTARIO, _dataLeitura, " +
      "_lat, _lng, DATAAQUISIC, VLRAQUISIC, NOTAFISCAL, " +
      "NOMEFORNECEDOR, CNPJ, SERIAL, ENDERECO, REGISTRO, SUBREG, " +
      "DATABAIXA, PRIMARYKEY, Sn1_recno, Sn3_recno, " +
      "_unitid, _tenantid, _photoUrl, _lastUpdated, _conferido, _is_synced " +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    var stmt = db.prepare(insertSqlValue);
    db.run("BEGIN TRANSACTION");

    // 4. Log de Rejeição de Colunas (Audit)
    var knownFields = [
      'ETIQUETA', 'PLAQUETA', 'CHAVE', 'CODIGO', 'ID', 'N1_CHAVE',
      'DESCRICAODOBEM', 'DESCRICAO', 'DESCRICAODOATIVO', 'N1_DESCRIC', 'ITEM',
      'GRUPO_EMPRESARIAL', 'EMPRESA', 'GRUPO', 'N1_FILIAL',
      'UNIDADE_OPERACIONAL', 'UNIDADE', 'FILIAL', 'LOCAL', 'LOCALIZACAO', 'N1_LOCAL',
      'CENTRODECUSTO', 'CENTRO_DE_CUSTO', 'CC_CUSTO', 'CC', 'CUSTO', 'N3_CCUSTO', 'SETOR',
      'CONTACONTABIL', 'CONTA_CONTABIL', 'CONTA', 'N1_CONTA', 'PLANO',
      'DATAAQUSIC', 'DATAAQUISIC', 'DATA_AQ', 'DATA', 'N1_DTACQUIS',
      'VLRAQUISIC', 'VALOR', 'N1_VALOR', 'PRECO',
      'NOTAFISCAL', 'NF', 'N1_NFISCAL', 'FACTURA',
      'NOMEFORNECEDOR', 'FORNECEDOR', 'VENDOR',
      'CNPJ', 'SERIAL', 'N1_SERIE', 'S_N', 'SERIE',
      'ENDERECO', 'SALA', 'LUGAR',
      'REGISTRO', 'N1_CODIGO', 'SUBREG', 'SUBREGISTRO',
      'DATA_BAIXA', 'N1_DTBAIXA', 'DATABAIXA',
      'PK', 'PRIMARYKEY', 'RECNO', 'SN1_RECNO', 'SN3_RECNO'
    ];

    var ignoredColumns = headers.filter(function(h) {
      return !knownFields.includes(h) && !h.startsWith('_');
    });

    if (ignoredColumns.length > 0) {
      console.warn("[Worker Audit] Colunas ignoradas por não pertencerem ao Schema:", ignoredColumns);
      self.postMessage({ 
        type: 'STATUS', 
        msg: "IMPORTAÇÃO SELETIVA: " + ignoredColumns.length + " colunas ignoradas (fora do padrão)." 
      });
      // Envia log detalhado para o frontend se ele estiver ouvindo logs específicos
      self.postMessage({
        type: 'LOG_REJECTION',
        columns: ignoredColumns
      });
    }

    for (var i = 1; i < totalRows; i++) {
        var rawRow = rawRows[i];
        if (!rawRow || rawRow.length === 0) continue;

        var row = {};
        var hasData = false;
        for (var j = 0; j < headers.length; j++) {
            var value = rawRow[j];
            if (value !== undefined && value !== null && value !== '') {
                row[headers[j]] = value;
                hasData = true;
            }
        }

        if (!hasData) continue;

        var assetId = "ID_" + Math.random().toString(36).substring(2) + Date.now().toString(36);

        // Improved mappings based on SCHEMA_PRIORITY v24.50
        var etiqueta = normalize(
            row.ETIQUETA || row.PLAQUETA || row.CHAVE || row.CODIGO || row.ID || row.N1_CHAVE || ''
        ).trim();
        
        var descricao = normalize(
            row.DESCRICAODOBEM || row.DESCRICAO || row.DESCRICAODOATIVO || row.N1_DESCRIC || row.ITEM || ''
        );
        
        var grupo = normalize(
            row.GRUPO_EMPRESARIAL || row.EMPRESA || row.GRUPO || row.N1_FILIAL || ''
        );

        var unidade = normalize(
            row.UNIDADE_OPERACIONAL || row.UNIDADE || row.FILIAL || row.LOCAL || 
            row.LOCALIZACAO || row.N1_LOCAL || row.CENTRODECUSTO || row.CENTRO_DE_CUSTO || 
            row.NOME_UNIDADE || row.LOJA || row.DEPARTAMENTO || row.ESTABELECIMENTO || 
            row.AREA || row.SETOR || ''
        ).trim();

        var custo = normalize(
            row.CENTRODECUSTO || row.CENTRO_DE_CUSTO || row.CC_CUSTO || row.CC || row.CUSTO || row.N3_CCUSTO || row.SETOR || ''
        );

        var conta = normalize(
            row.CONTACONTABIL || row.CONTA_CONTABIL || row.CONTA || row.N1_CONTA || row.PLANO || ''
        );

        var data_aq = normalize(
            row.DATAAQUSIC || row.DATAAQUISIC || row.DATA_AQ || row.DATA || row.N1_DTACQUIS || ''
        );

        var valor_aq = Number(
            row.VLRAQUISIC || row.VALOR || row.N1_VALOR || row.PRECO || 0
        );

        var nf = normalize(
            row.NOTAFISCAL || row.NF || row.N1_NFISCAL || row.FACTURA || ''
        );

        var fornecedor = normalize(
            row.NOMEFORNECEDOR || row.FORNECEDOR || row.VENDOR || ''
        );

        stmt.run([
            assetId,
            etiqueta,
            descricao,
            grupo,
            unidade,
            custo,
            conta,
            'PENDENTE', // TAG_INVENTARIO
            null, // _dataLeitura
            null, // _lat
            null, // _lng
            data_aq,
            valor_aq,
            nf,
            fornecedor,
            normalize(row.CNPJ || ''),
            normalize(row.SERIAL || row.N1_SERIE || row.S_N || ''),
            normalize(row.ENDERECO || row.SALA || row.LUGAR || ''),
            normalize(row.REGISTRO || ''),
            normalize(row.SUBREG || ''),
            normalize(row.DATA_BAIXA || row.N1_DTBAIXA || row.DATABAIXA || ''),
            normalize(row.PK || row.PRIMARYKEY || row.RECNO || ''),
            Number(row.SN1_RECNO || row.RECNO || 0),
            Number(row.SN3_RECNO || 0),
            unidade, // _unitid
            grupo,   // _tenantid
            null, // _photoUrl
            new Date().toISOString(), // _lastUpdated
            0, // _conferido (false)
            0  // _is_synced (false)
        ]);

        processedCount++;

        if (processedCount % CHUNK_SIZE === 0) {
            db.run("COMMIT");
            self.postMessage({ type: 'PROGRESS', current: processedCount, total: totalRows - 1 });
            db.run("BEGIN TRANSACTION");
        }
    }

    db.run("COMMIT");
    stmt.free();

    // Reclaim space and optimize
    sendStatus("Otimizando banco de dados (VACUUM)...");
    db.run("VACUUM");

    // Export Updated DB
    var finalExpBuffer = db.export();
    db.close();
    
    self.postMessage({ 
      type: 'COMPLETE', 
      dbBuffer: finalExpBuffer, 
      total: processedCount 
    }, [finalExpBuffer.buffer]);
    
  } catch (err) {
    console.error("[Worker Error]", err);
    self.postMessage({ 
      type: 'ERROR', 
      msg: err.message || 'Erro desconhecido no Worker',
      stack: err.stack
    });
  }
};

// Listen to both postMessage AND BroadcastChannel as fallbacks
self.addEventListener('message', function(e) {
  processData(e.data);
}, { passive: true });

channel.onmessage = function(e) {
  processData(e.data);
};
