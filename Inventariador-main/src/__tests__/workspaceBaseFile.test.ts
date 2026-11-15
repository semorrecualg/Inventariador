// @vitest-environment jsdom
// ============================================================================
// workspaceBaseFile.test.ts — base local dentro da pasta vinculada.
//
// A pasta escolhida pelo utilizador passa a ser o endereço de trabalho: a base
// é gravada em `gbr_base_local.json` e relida de lá. Estes testes fixam o
// contrato do ficheiro e o comportamento quando não há permissão de escrita —
// antes disso a pasta só servia para listar planilhas e o cartão continuava a
// dizer "NENHUM DIRETÓRIO VINCULADO".
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveBaseToWorkspace,
  readBaseFromWorkspace,
  WORKSPACE_BASE_FILE
} from '../services/localDbService';

const ficheiros = new Map<string, string>();

const criarPasta = (permissao: string | null = 'granted') => ({
  name: 'PASTA_TESTE',
  queryPermission: permissao === null ? undefined : vi.fn().mockResolvedValue(permissao),
  requestPermission: permissao === null ? undefined : vi.fn().mockResolvedValue(permissao),
  getFileHandle: async (nome: string, opcoes?: { create?: boolean }) => {
    if (!opcoes?.create && !ficheiros.has(nome)) {
      throw new DOMException('não existe', 'NotFoundError');
    }
    return {
      createWritable: async () => ({
        write: async (dados: string) => { ficheiros.set(nome, dados); },
        close: async () => undefined
      }),
      getFile: async () => ({ text: async () => ficheiros.get(nome) ?? '' })
    };
  }
});

describe('base local na pasta vinculada', () => {
  beforeEach(() => {
    ficheiros.clear();
  });

  it('grava a base em gbr_base_local.json e devolve o retrato do que gravou', async () => {
    const pasta = criarPasta();
    const ativos = [{ CODIGO: 'A1', tenantid: 'CICOPAL' }, { CODIGO: 'A2', tenantid: 'CICOPAL' }];

    const snapshot = await saveBaseToWorkspace(ativos, pasta);

    expect(snapshot?.count).toBe(2);
    expect(ficheiros.has(WORKSPACE_BASE_FILE)).toBe(true);
    const gravado = JSON.parse(ficheiros.get(WORKSPACE_BASE_FILE) as string);
    expect(gravado.assets).toHaveLength(2);
    expect(gravado.assets[0].CODIGO).toBe('A1');
  });

  it('relê a base gravada na pasta', async () => {
    const pasta = criarPasta();
    await saveBaseToWorkspace([{ CODIGO: 'A1' }], pasta);

    const lido = await readBaseFromWorkspace(pasta);

    expect(lido?.assets).toHaveLength(1);
    expect(lido?.saved_at).toBeTruthy();
  });

  it('pasta ainda sem ficheiro devolve null (primeira vinculação)', async () => {
    expect(await readBaseFromWorkspace(criarPasta())).toBeNull();
  });

  it('sem permissão de escrita não grava nada', async () => {
    const pasta = criarPasta('denied');

    expect(await saveBaseToWorkspace([{ CODIGO: 'A1' }], pasta)).toBeNull();
    expect(ficheiros.size).toBe(0);
  });

  it('handle sem API de permissões (OPFS) grava na mesma', async () => {
    const pasta = criarPasta(null);

    const snapshot = await saveBaseToWorkspace([{ CODIGO: 'A1' }], pasta);

    expect(snapshot?.count).toBe(1);
    expect(ficheiros.has(WORKSPACE_BASE_FILE)).toBe(true);
  });

  it('sem pasta nenhuma devolve null em vez de estourar', async () => {
    expect(await saveBaseToWorkspace([], undefined)).toBeNull();
    expect(await readBaseFromWorkspace(undefined)).toBeNull();
  });
});
