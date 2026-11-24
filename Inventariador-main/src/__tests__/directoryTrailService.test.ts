// @vitest-environment jsdom
// src/__tests__/directoryTrailService.test.ts
// A trilha de diretório é o endereço físico do app no telemóvel: nasce da pasta
// onde o operador escolheu a planilha e passa a ser o destino de tudo o que o
// app grava. Sem estes testes, um caminho SAF mal convertido gravaria no sítio
// errado — ou mostraria ao operador um endereço que não existe.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const estado = vi.hoisted(() => ({ nativo: true }));
const writeFile = vi.hoisted(() => vi.fn());
const readFile = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => estado.nativo }
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFile(...args),
    readFile: (...args: unknown[]) => readFile(...args)
  },
  Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL', ExternalStorage: 'EXTERNAL_STORAGE' },
  Encoding: { UTF8: 'utf8' }
}));

import {
  captureDirectoryTrail,
  clearDirectoryTrail,
  DIRECTORY_TRAIL_KEY,
  getDirectoryTrail,
  physicalPathFromPicker,
  readFileOnTrail,
  saveFileOnTrail
} from '../services/directoryTrailService';

const PASTA_SAF = 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2FGBR';
const PLANILHA_SAF = 'content://com.android.externalstorage.documents/document/primary%3ADownload%2FGBR%2Fbase.xlsx';

describe('physicalPathFromPicker', () => {
  it('converte a pasta SAF (tree) no caminho físico', () => {
    expect(physicalPathFromPicker(PASTA_SAF, 'pasta')).toBe('/storage/emulated/0/Download/GBR');
  });

  it('na planilha (document) descarta o nome do ficheiro e fica com a pasta', () => {
    expect(physicalPathFromPicker(PLANILHA_SAF, 'ficheiro')).toBe('/storage/emulated/0/Download/GBR');
  });

  it('aceita file:// e caminho absoluto, incluindo /sdcard', () => {
    expect(physicalPathFromPicker('file:///storage/emulated/0/Download/base.xlsx', 'ficheiro'))
      .toBe('/storage/emulated/0/Download');
    expect(physicalPathFromPicker('/sdcard/Documents/GBR', 'pasta')).toBe('/storage/emulated/0/Documents/GBR');
  });

  it('devolve null quando o provedor não é do armazenamento local', () => {
    expect(physicalPathFromPicker('content://com.google.android.apps.docs.storage/document/abc123', 'ficheiro')).toBeNull();
    expect(physicalPathFromPicker('', 'pasta')).toBeNull();
  });
});

describe('trilha de diretório', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    writeFile.mockReset();
    readFile.mockReset();
    estado.nativo = true;
  });

  it('captura a pasta da planilha, grava de forma persistente e alimenta o vínculo legado', () => {
    const trail = captureDirectoryTrail(PLANILHA_SAF, { origem: 'planilha', sourceFileName: 'base.xlsx' });

    expect(trail?.path).toBe('/storage/emulated/0/Download/GBR');
    expect(trail?.folderName).toBe('GBR');
    expect(trail?.externalRelativePath).toBe('Download/GBR');
    expect(trail?.sourceFileName).toBe('base.xlsx');
    // Persistente (localStorage), não apenas na sessão.
    expect(localStorage.getItem(DIRECTORY_TRAIL_KEY)).toContain('/storage/emulated/0/Download/GBR');
    expect(sessionStorage.getItem('gbr_physical_folder_name')).toBe('GBR');
    expect(getDirectoryTrail()).toMatchObject({ path: '/storage/emulated/0/Download/GBR', origem: 'planilha' });
  });

  it('grava primeiro na trilha e devolve o caminho físico real', async () => {
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });
    writeFile.mockResolvedValueOnce({ uri: 'file:///storage/emulated/0/Download/GBR/pacote.dat' });

    const resultado = await saveFileOnTrail('pacote.dat', 'conteudo');

    expect(resultado).toMatchObject({
      saved: true,
      destino: 'trilha',
      path: '/storage/emulated/0/Download/GBR/pacote.dat'
    });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toMatchObject({
      path: 'Download/GBR/pacote.dat',
      directory: 'EXTERNAL_STORAGE',
      encoding: 'utf8',
      recursive: true
    });
  });

  it('sem permissão na trilha, cai para Documentos e para o armazenamento do app', async () => {
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });
    writeFile
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockRejectedValueOnce(new Error('Permission denied'))
      .mockResolvedValueOnce({ uri: 'file:///app/pacote.dat' });

    const resultado = await saveFileOnTrail('pacote.dat', 'conteudo');

    expect(resultado).toMatchObject({
      saved: true,
      destino: 'app',
      path: 'Armazenamento do app/GBR_KARDEK_DATA/pacote.dat'
    });
    expect(resultado.tentativas).toEqual([
      '/storage/emulated/0/Download/GBR/pacote.dat',
      'Documentos/GBR_KARDEK_DATA/pacote.dat',
      'Armazenamento do app/GBR_KARDEK_DATA/pacote.dat'
    ]);
  });

  it('diz que não gravou quando nenhuma pasta aceita o ficheiro', async () => {
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });
    writeFile.mockRejectedValue(new Error('sem storage'));

    const resultado = await saveFileOnTrail('pacote.dat', 'conteudo');

    expect(resultado.saved).toBe(false);
    expect(resultado.path).toBeUndefined();
    expect(resultado.tentativas).toHaveLength(3);
  });

  it('lê o ficheiro pela trilha antes de tentar as pastas de recurso', async () => {
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });
    readFile.mockResolvedValueOnce({ data: '[{"id":"1"}]' });

    await expect(readFileOnTrail('local_assets_secure.dat')).resolves.toBe('[{"id":"1"}]');
    expect(readFile.mock.calls[0][0]).toMatchObject({
      path: 'Download/GBR/local_assets_secure.dat',
      directory: 'EXTERNAL_STORAGE'
    });
  });

  it('na Web não grava nem lê pelo Filesystem', async () => {
    estado.nativo = false;
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });

    await expect(saveFileOnTrail('pacote.dat', 'conteudo')).resolves.toMatchObject({ saved: false, tentativas: [] });
    await expect(readFileOnTrail('local_assets_secure.dat')).resolves.toBeNull();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('limpar a trilha volta ao estado sem pasta definida', () => {
    captureDirectoryTrail(PASTA_SAF, { origem: 'pasta-escolhida' });

    clearDirectoryTrail();

    expect(getDirectoryTrail()).toBeNull();
    expect(sessionStorage.getItem('gbr_physical_folder_name')).toBeNull();
  });
});
