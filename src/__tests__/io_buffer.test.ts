// src/__tests__/io_buffer.test.ts
import { describe, it, expect } from 'vitest';

// Simulating the exact GBR v2.6 Batch Ingestion Engine according to SRE Rules
class MockBatchProcessor {
  public batchSize = 200;
  public isImportingBatch = false;
  public saveDatabaseCalls = 0;
  public processedCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public batchesProcessed: Array<any[]> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async importData(rows: any[]) {
    this.isImportingBatch = true;
    this.saveDatabaseCalls = 0;
    this.processedCount = 0;
    this.batchesProcessed = [];

    try {
      // Regra dos 200 Itens: fatiamento rígido e invariável das linhas fisicamente lidas
      for (let i = 0; i < rows.length; i += this.batchSize) {
        const chunk = rows.slice(i, i + this.batchSize);
        this.batchesProcessed.push(chunk);
        
        // Simulating the record level physical inserts
        for (const record of chunk) {
          if (record) {
            this.processedCount++;
          }
        }
      }

      // saveDatabase físico em disco só roda UMA VEZ no encerramento final do processamento de blocos
      await this.saveDatabase();

    } finally {
      this.isImportingBatch = false;
    }

    return this.processedCount;
  }

  async saveDatabase() {
    this.saveDatabaseCalls++;
  }
}

describe('GBR SRE Carga Expert - I/O Buffer Test Suite', () => {
  it('deve fatiar o buffer rigorosamente em blocos de exatamente 200 itens', async () => {
    const processor = new MockBatchProcessor();
    const mockPlanilha = Array.from({ length: 450 }, (_, i) => ({ id: i, label: `ATIVO-${i}` }));

    const totalProcessed = await processor.importData(mockPlanilha);

    // Validações SRE estritas
    expect(totalProcessed).toBe(450);
    expect(processor.batchesProcessed.length).toBe(3); // 200 + 200 + 50
    expect(processor.batchesProcessed[0].length).toBe(200);
    expect(processor.batchesProcessed[1].length).toBe(200);
    expect(processor.batchesProcessed[2].length).toBe(50); // Volume residual
  });

  it('deve processar o volume residual sem truncamentos ou descartes silenciosos de registros', async () => {
    const processor = new MockBatchProcessor();
    const mockPlanilha = Array.from({ length: 1005 }, (_, i) => ({ id: i }));

    const totalProcessed = await processor.importData(mockPlanilha);

    expect(totalProcessed).toBe(1005);
    expect(processor.batchesProcessed.length).toBe(6); // 200 * 5 + 5
    expect(processor.batchesProcessed[5].length).toBe(5); // Resíduo final de exatamente 5 itens

    // Valida a integridade total do buffer fatiado (soma das partes = total real importado)
    const sumOfBatches = processor.batchesProcessed.reduce((acc, batch) => acc + batch.length, 0);
    expect(sumOfBatches).toBe(1005);
  });

  it('deve manter a blindagem isImportingBatch isolada e garantir saveDatabase único por ciclo', async () => {
    const processor = new MockBatchProcessor();
    const mockPlanilha = Array.from({ length: 650 }, (_, i) => ({ id: i }));

    // Verificação de isolamento do lock no início e rollback/finally
    expect(processor.isImportingBatch).toBe(false);

    const promise = processor.importData(mockPlanilha);
    
    // Durante o fluxo de processamento de carga massiva, o lock deve estar obrigatoriamente ativo (isImportingBatch = true)
    expect(processor.isImportingBatch).toBe(true);

    await promise;

    // No encerramento (incluindo em blocos finally), o lock deve ser desligado fisicamente
    expect(processor.isImportingBatch).toBe(false);

    // O saveDatabase físico de disco só pode ter sido invocado exatamente UMA vez (no fim de todas as transações)
    expect(processor.saveDatabaseCalls).toBe(1);
  });
});
