// @vitest-environment jsdom
// ============================================================================
// erroNuvemPull.test.ts — o pull e a sincronização também dizem o código real.
//
// O pull lançava o erro do PostgREST CRU (não é uma instância de `Error`) e o
// `App` caía sempre no ramo genérico: «Erro de tráfego em rede WebView». Uma
// recusa `42501` chegava ao operador como se fosse falha de rede. Agora a
// paginação sobe o motivo já legível e os avisos da sincronização conservam o
// código, o detalhe e a dica.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type * as SupabaseService from '../services/supabaseService';
import { pareceFalhaDeCanal } from '../utils/erroNuvem';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

let fetchFullInventory: typeof SupabaseService.fetchFullInventory;
let supabaseStub: { from: (table: string) => unknown };

/** Builder mínimo do pull: `from().select().range().eq().abortSignal()`. */
function stubPagina(error: unknown) {
  const pagina = { abortSignal: vi.fn(async () => ({ data: null, error })) };
  const filtro = { eq: vi.fn(() => pagina), in: vi.fn(() => pagina) };
  const builder = { select: vi.fn(() => ({ range: vi.fn(() => filtro) })) };
  return vi.spyOn(supabaseStub, 'from').mockImplementation(() => builder);
}

describe('o pull da nuvem diz o código real da recusa', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    fetchFullInventory = mod.fetchFullInventory;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('42501 na paginação chega com código, detalhe e dica — não como erro de rede', async () => {
    stubPagina({
      code: '42501',
      message: 'permission denied for table assets',
      details: 'role anon',
      hint: 'entrar com e-mail e senha'
    });

    await expect(fetchFullInventory('CICOPAL')).rejects.toThrow(
      /\[42501\] permission denied for table assets · detalhe: role anon · dica: entrar com e-mail e senha/
    );
    await expect(fetchFullInventory('CICOPAL')).rejects.not.toThrow(/Erro de tráfego|Erro de esquema/);
  });

  it('resposta sem campos não vira diagnóstico inventado', async () => {
    stubPagina({});

    await expect(fetchFullInventory('OUTRO')).rejects.toThrow(
      /resposta sem código nem mensagem do servidor/
    );
  });

  it('falha de rede conserva o nome e a mensagem originais', async () => {
    stubPagina(new TypeError('Failed to fetch'));

    await expect(fetchFullInventory('TERCEIRO')).rejects.toThrow(/TypeError: Failed to fetch/);
  });
});

describe('a recusa da nuvem não é confundida com falha de rede', () => {
  it('42501 é recusa de dados, não de canal', () => {
    expect(
      pareceFalhaDeCanal({
        code: '42501',
        message: 'permission denied for table assets',
        details: 'role anon'
      })
    ).toBe(false);
    expect(pareceFalhaDeCanal(new Error('permission denied for table dics'))).toBe(false);
  });

  it('os sinais do canal continuam a valer', () => {
    expect(pareceFalhaDeCanal(new TypeError('Failed to fetch'))).toBe(true);
    expect(pareceFalhaDeCanal(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
    expect(pareceFalhaDeCanal({ status: 0 })).toBe(true);
  });
});

describe('os avisos de pull e sincronização usam o formatador', () => {
  const ler = (relativo: string) =>
    readFileSync(join(process.cwd(), 'src', relativo), 'utf8');

  it('o pull não troca a recusa por «erro de tráfego» nem por um texto genérico', () => {
    const app = ler('App.tsx');
    expect(app).toContain('Falha ao baixar a base da nuvem: ${motivo}');
    expect(app).toContain('A nuvem recusou a base');
    expect(app).toContain('const isSuspendedNetwork = pareceFalhaDeCanal(error);');
    expect(app).not.toContain("includes('io')");
    expect(app).not.toContain(
      "setSyncError('Erro de tráfego em rede WebView. Chaveado para contingência local.');"
    );
  });

  it('o arranque não chama «falha da nuvem» ao que falhou no aparelho', () => {
    const app = ler('App.tsx');
    expect(app).toContain('setSyncError(`Falha ao carregar a base: ${motivo}`)');
    expect(app).not.toContain('Falha ao carregar a base da nuvem no arranque');
  });

  it('o autosave e o envio de alterações mostram o motivo real', () => {
    const app = ler('App.tsx');
    expect(app).toContain('setSyncError(`Erro na sincronização: ${descreverErroNuvem(err)}`)');
    expect(app).toContain('Erro ao enviar alterações locais: ${descreverErroNuvem(err)}');
    expect(app).not.toContain("setSyncError('Erro na sincronização');");
  });

  it('o download manual mostra o motivo em vez de culpar a conexão', () => {
    const app = ler('App.tsx');
    expect(app).toContain('O download da nuvem falhou: ${motivo}');
    expect(app).not.toContain(
      'Ocorreu um erro ao tentar baixar os dados da nuvem. Verifique sua conexão.'
    );
  });

  it('o painel de bases e o espelhamento usam o formatador', () => {
    const ecra = ler('screens/DatabaseManagerScreen.tsx');
    expect(ecra).toContain('const errMsg = descreverErroNuvem(err);');
  });

  it('a paginação do pull embrulha o erro do PostgREST já legível', () => {
    const servico = ler('services/supabaseService.ts');
    const inicio = servico.indexOf('const fetchFullInventoryImpl');
    const fim = servico.indexOf('// 2. Busca a configuração', inicio);
    const paginacao = servico.slice(inicio, fim);
    expect(paginacao).toContain('Falha ao baixar a base da Nuvem (lote');
    expect(paginacao).toContain('${descreverErroNuvem(assetsError)}');
    expect(paginacao).not.toContain('throw assetsError;');
  });

  it('o pull não engole a recusa como «sem dados»', () => {
    const servico = ler('services/supabaseService.ts');
    const inicio = servico.indexOf('Erro ao buscar o inventário na nuvem');
    expect(inicio).toBeGreaterThan(0);
    expect(servico.slice(inicio, inicio + 400)).toContain('throw err;');
    expect(servico).not.toContain("logger.error('Erro inesperado ao buscar inventário completo:'");
  });
});
