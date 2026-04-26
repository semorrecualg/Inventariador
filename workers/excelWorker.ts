
import * as XLSX from 'xlsx';

/**
 * Web Worker for heavy Excel processing.
 * Refactored to use manual iteration and streaming to minimize memory spikes.
 */

// Global error handlers inside the worker
self.onerror = (e) => {
  console.error("Worker Internal Error:", e);
  self.postMessage({ type: 'ERROR', msg: 'Erro interno no Worker', stack: String(e) });
};

self.onunhandledrejection = (e) => {
  console.error("Worker Unhandled Rejection:", e);
  self.postMessage({ type: 'ERROR', msg: 'Rejeição não tratada no Worker', stack: String(e.reason) });
};

self.onmessage = async (e: MessageEvent) => {
  const { dataBuffer } = e.data;
  
  try {
    // Read the workbook. 
    // Note: read() still loads the whole file buffer, but we will avoid sheet_to_json for the large row array.
    const wb = XLSX.read(dataBuffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    
    if (!ws['!ref']) {
      throw new Error("Planilha vazia ou sem referência de células.");
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    const totalRows = range.e.r - range.s.r; // Estimado (exclui cabeçalho)
    
    self.postMessage({ type: 'STATUS', msg: `Iniciando processamento de ~${totalRows} linhas.` });

    // Identify headers from the first row
    const headers: string[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
      headers.push(cell ? String(cell.v).toUpperCase().trim() : `COL_${C}`);
    }

    const CHUNK_SIZE = 500; // Smaller batches for more frequent UI updates and less main thread blocking
    const currentChunk: Record<string, unknown>[] = [];
    let processedCount = 0;

    const normalize = (val: unknown) => val === undefined || val === null ? '' : String(val);

    // Iterar manualmente linha por linha para economizar memória
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const row: Record<string, unknown> = {};
      let hasData = false;
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v !== undefined && cell.v !== null) {
          row[headers[C]] = cell.v;
          hasData = true;
        }
      }

      if (!hasData) continue; // Skip empty rows

      // Mapping Logic
      // Tenta ser o mais flexível possível com os nomes das colunas
      const asset = {
        id: self.crypto?.randomUUID ? self.crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        ETIQUETA: normalize(row.ETIQUETA || row.PLAQUETA || row.CHAVE || row.ID || row.CODIGO).trim(),
        DESCRICAODOATIVO: normalize(row.DESCRICAO || row.DESCRICAODOBEM || row.N1_DESCRIC || row.DESCRICAODOATIVO || row.ITEM),
        GRUPO_EMPRESARIAL: normalize(row.EMPRESA || row.N1_FILIAL || row.GRUPO_EMPRESARIAL || row.GRUPO),
        UNIDADE_OPERACIONAL: normalize(row.UNIDADE || row.LOCAL || row.C1_LOCAL || row.UNIDADE_OPERACIONAL || row.LOJA),
        CENTRODECUSTO: normalize(row.CUSTO || row.CC || row.N3_CCUSTO || row.CENTRODECUSTO || row.SETOR),
        CONTACONTABIL: normalize(row.CONTA || row.N1_CONTA || row.CONTACONTABIL || row.PLANO),
        STATUS: normalize(row.STATUS || 'PENDENTE'),
        DATAAQUISIC: normalize(row.DATA_AQ || row.N1_DTACQUIS || row.DATAAQUISIC || row.DATA),
        VLRAQUISIC: Number(row.VALOR || row.N1_VALOR || row.VLRAQUISIC || row.PRECO || 0),
        NOTAFISCAL: normalize(row.NF || row.N1_NFISCAL || row.NOTAFISCAL || row.FACTURA),
        NOMEFORNECEDOR: normalize(row.FORNECEDOR || row.NOMEFORNECEDOR || row.VENDOR),
        CNPJ: normalize(row.CNPJ),
        SERIAL: normalize(row.SERIAL || row.N1_SERIE || row.SERIAL || row.S_N),
        ENDERECO: normalize(row.ENDERECO || row.SALA || row.LUGAR),
        REGISTRO: normalize(row.REGISTRO),
        SUBREG: normalize(row.SUBREG),
        DATABAIXA: normalize(row.DATA_BAIXA || row.N1_DTBAIXA || row.DATABAIXA),
        PRIMARYKEY: normalize(row.PK || row.PRIMARYKEY || row.RECNO),
        Sn1_recno: Number(row.SN1_RECNO || row.RECNO || row.SN1_RECNO || 0),
        Sn3_recno: Number(row.SN3_RECNO || row.SN3_RECNO || 0),
        TAG_INVENTARIO: 'PENDENTE',
        _conferido: false,
        _lastUpdated: new Date().toISOString()
      };

      currentChunk.push(asset);
      processedCount++;

      if (currentChunk.length >= CHUNK_SIZE) {
        const jsonString = JSON.stringify(currentChunk);
        const encoder = new TextEncoder();
        const buffer = encoder.encode(jsonString);
        
        self.postMessage({ 
          type: 'CHUNK_TRANSFER', 
          data: buffer, 
          current: processedCount, 
          total: totalRows 
        }, [buffer.buffer]);
        
        currentChunk = [];
      }
    }

    // Final chunk
    if (currentChunk.length > 0) {
      const jsonString = JSON.stringify(currentChunk);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(jsonString);

      self.postMessage({ 
        type: 'CHUNK_TRANSFER', 
        data: buffer, 
        current: processedCount, 
        total: totalRows 
      }, [buffer.buffer]);
    }
    
    self.postMessage({ type: 'COMPLETE' });
    
  } catch (err: unknown) {
    const error = err as Error;
    self.postMessage({ 
      type: 'ERROR', 
      msg: error?.message || 'Erro desconhecido no Worker',
      stack: error?.stack,
      raw: JSON.stringify(err)
    });
  }
};
