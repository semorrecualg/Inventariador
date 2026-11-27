// @vitest-environment jsdom
// ============================================================================
// erroNuvemVisivel.test.ts — as leituras da nuvem dizem o código real.
//
// `countCloudAssets` (placar do Gestor) e `downloadBaseToLocal` engoliam o
// motivo com `error.message || 'Erro de esquema.'`. Uma resposta 42501 tem de
// chegar ao operador com `[42501]`; uma resposta sem campos, como «resposta sem
// código nem mensagem», e nunca como um diagnóstico inventado.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

type Resposta = {
  count?: number | null;
  data?: unknown[] | null;
  error?: unknown;
};

let countCloudAssets: typeof SupabaseService.countCloudAssets;
let downloadBaseToLocal: typeof SupabaseService.downloadBaseToLocal;
let supabaseStub: { from: (table: string) => unknown };

/** Builder mínimo do PostgREST: `from(...).select(...).eq(...)` é awaited. */
function stubResposta(resposta: Resposta) {
  const builder = {
    select: vi.fn(() => ({ eq: vi.fn(async () => resposta) }))
  };
  return vi.spyOn(supabaseStub, 'from').mockImplementation(() => builder);
}

describe('erros da nuvem visíveis nas leituras', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    countCloudAssets = mod.countCloudAssets;
    downloadBaseToLocal = mod.downloadBaseToLocal;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contagem da base: 42501 chega com código, detalhe e dica', async () => {
    stubResposta({
      count: null,
      error: {
        code: '42501',
        message: 'permission denied for table assets',
        details: 'role anon',
        hint: 'entrar com e-mail e senha'
      }
    });

    await expect(countCloudAssets('CICOPAL')).rejects.toThrow(
      /\[42501\] permission denied for table assets · detalhe: role anon · dica: entrar com e-mail e senha/
    );
    await expect(countCloudAssets('CICOPAL')).rejects.not.toThrow(/Erro de esquema/);
  });

  it('contagem da base: resposta sem campos não vira «Erro de esquema.»', async () => {
    stubResposta({ count: null, error: {} });

    await expect(countCloudAssets('CICOPAL')).rejects.toThrow(
      /resposta sem código nem mensagem do servidor/
    );
    await expect(countCloudAssets('CICOPAL')).rejects.not.toThrow(/Erro de esquema/);
  });

  it('contagem da base: falha de rede conserva a mensagem original', async () => {
    stubResposta({ count: null, error: new TypeError('Failed to fetch') });

    await expect(countCloudAssets('CICOPAL')).rejects.toThrow(/TypeError: Failed to fetch/);
  });

  it('download da base: tabela ausente chega com o código do PostgREST', async () => {
    stubResposta({
      count: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.assets' in the schema cache"
      }
    });

    await expect(downloadBaseToLocal('CICOPAL')).rejects.toThrow(
      /\[PGRST205\] Could not find the table 'public\.assets'/
    );
    await expect(downloadBaseToLocal('CICOPAL')).rejects.not.toThrow(/Erro de esquema/);
  });
});
