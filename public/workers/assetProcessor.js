
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

    var CHUNK_SIZE = 100;
    var processedCount = 0;
    var normalize = function(val) { 
      return (val === undefined || val === null) ? '' : String(val); 
    };

    var insertSqlValue = "INSERT OR REPLACE INTO assets ( " +
      "id, ETIQUETA, DESCRICAODOBEM, GRUPO_EMPRESARIAL, UNIDADE_OPERACIONAL, " +
      "CC_CUSTO, CONTA_CONTABIL, STATUS, DATA_HORA_CONFERENCIA, " +
      "LATITUDE, LONGITUDE, DATAAQUISIC, VLRAQUISIC, NOTAFISCAL, " +
      "NOMEFORNECEDOR, CNPJ, SERIAL, ENDERECO, REGISTRO, SUBREG, " +
      "DATABAIXA, PRIMARYKEY, Sn1_recno, Sn3_recno, " +
      "_unitid, _tenantid, _photoUrl, TAG_INVENTARIO, _lastUpdated, _conferido, _is_synced " +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    var stmt = db.prepare(insertSqlValue);
    db.run("BEGIN TRANSACTION");

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

        stmt.run([
            assetId,
            normalize(row.ETIQUETA || row.PLAQUETA || row.CHAVE || row.ID || row.CODIGO).trim(),
            normalize(row.DESCRICAO || row.DESCRICAODOBEM || row.N1_DESCRIC || row.DESCRICAODOATIVO || row.ITEM),
            normalize(row.EMPRESA || row.N1_FILIAL || row.GRUPO_EMPRESARIAL || row.GRUPO),
            normalize(row.UNIDADE || row.LOCAL || row.C1_LOCAL || row.UNIDADE_OPERACIONAL || row.LOJA),
            normalize(row.CUSTO || row.CC || row.N3_CCUSTO || row.CENTRODECUSTO || row.SETOR),
            normalize(row.CONTA || row.N1_CONTA || row.CONTACONTABIL || row.PLANO),
            normalize(row.STATUS || 'PENDENTE'),
            null, // DATA_HORA_CONFERENCIA
            null, // LATITUDE
            null, // LONGITUDE
            normalize(row.DATA_AQ || row.N1_DTACQUIS || row.DATAAQUISIC || row.DATA),
            Number(row.VALOR || row.N1_VALOR || row.VLRAQUISIC || row.PRECO || 0),
            normalize(row.NF || row.N1_NFISCAL || row.NOTAFISCAL || row.FACTURA),
            normalize(row.FORNECEDOR || row.NOMEFORNECEDOR || row.VENDOR),
            normalize(row.CNPJ || ''),
            normalize(row.SERIAL || row.N1_SERIE || row.S_N || ''),
            normalize(row.ENDERECO || row.SALA || row.LUGAR || ''),
            normalize(row.REGISTRO || ''),
            normalize(row.SUBREG || ''),
            normalize(row.DATA_BAIXA || row.N1_DTBAIXA || row.DATABAIXA || ''),
            normalize(row.PK || row.PRIMARYKEY || row.RECNO || ''),
            Number(row.SN1_RECNO || row.RECNO || 0),
            Number(row.SN3_RECNO || 0),
            null, // _unitid
            null, // _tenantid
            null, // _photoUrl
            'PENDENTE', // TAG_INVENTARIO
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
