// src/__tests__/securityExportNative.test.ts
// O APK não grava o pacote pelo `<a download>` do WebView: o export nativo tem
// de escrever um ficheiro datado e devolver o caminho para a UI. Sem isto o
// operador exportava e não encontrava ficheiro nenhum no telefone.
import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const writeFile = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true }
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...args: unknown[]) => writeFile(...args) },
  Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL' },
  Encoding: { UTF8: 'utf8' }
}));

type Servico = typeof import('../services/securityExportService');
let persistSecurityExportPhysical: Servico['persistSecurityExportPhysical'];

const manifesto = {
  format: 'GBR_KARDEK_SECURITY_EXPORT',
  schemaVersion: '1.1',
  exportedAt: '2026-11-24T03:00:00.000Z',
  tables: {}
} as unknown as Parameters<Servico['persistSecurityExportPhysical']>[0];

const NOME = 'GBR_SECURITY_EXPORT_v1.1_2026-11-24T03-00-00-000Z.dat';

describe('persistSecurityExportPhysical — pacote no telefone', () => {
  beforeAll(async () => {
    ({ persistSecurityExportPhysical } = await import('../services/securityExportService'));
  }, 120000);

  beforeEach(() => {
    writeFile.mockReset();
  });

  it('grava nos Documentos com nome datado e devolve o caminho', async () => {
    writeFile.mockResolvedValue({ uri: 'file:///storage/emulated/0/Documents/GBR_KARDEK_DATA/' + NOME });

    const result = await persistSecurityExportPhysical(manifesto);

    expect(result.saved).toBe(true);
    expect(result.path).toBe(`Documentos/GBR_KARDEK_DATA/${NOME}`);
    expect(result.uri).toContain('file:///storage/emulated/0/Documents/');
    expect(writeFile).toHaveBeenCalledTimes(1);
    const pedido = writeFile.mock.calls[0][0] as {
      path: string;
      directory: string;
      encoding: string;
      recursive: boolean;
      data: string;
    };
    expect(pedido.path).toBe(`GBR_KARDEK_DATA/${NOME}`);
    expect(pedido.directory).toBe('DOCUMENTS');
    expect(pedido.encoding).toBe('utf8');
    expect(pedido.recursive).toBe(true);
    expect(JSON.parse(pedido.data).schemaVersion).toBe('1.1');
  });

  it('sem permissão nos Documentos, grava no armazenamento do app', async () => {
    writeFile
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce({ uri: 'file:///storage/emulated/0/Android/data/com.gbr.kardek/files/GBR_KARDEK_DATA/' + NOME });

    const result = await persistSecurityExportPhysical(manifesto);

    expect(result.saved).toBe(true);
    expect(result.path).toBe(`Armazenamento do app/GBR_KARDEK_DATA/${NOME}`);
    expect(writeFile).toHaveBeenCalledTimes(2);
    const diretorios = writeFile.mock.calls.map(call => (call[0] as { directory: string }).directory);
    expect(diretorios).toEqual(['DOCUMENTS', 'EXTERNAL']);
  });

  it('quando nenhuma pasta aceita a escrita, diz que não gravou', async () => {
    writeFile.mockRejectedValue(new Error('sem storage'));

    const result = await persistSecurityExportPhysical(manifesto);

    expect(result.saved).toBe(false);
    expect(result.path).toBeUndefined();
    // O nome muda a cada export: um pacote novo não apaga o antigo.
    const caminhos = writeFile.mock.calls.map(call => (call[0] as { path: string }).path);
    expect(caminhos.every(path => path.includes(NOME))).toBe(true);
  });
});
