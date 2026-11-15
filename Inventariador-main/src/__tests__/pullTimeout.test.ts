// @vitest-environment node
// ============================================================================
// pullTimeout.test.ts — o pull não pode ficar pendurado para sempre.
//
// Sintoma real: overlay "SINCRONIZANDO BASE / aguarde, baixando dados da nuvem"
// a girar por tempo indeterminado. O `finally` do sync só corre quando a
// promessa assenta; um socket meio-aberto (WebView/rede móvel) nunca assenta.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { comTimeout, PULL_PAGE_TIMEOUT_MS } from '../utils/pullTimeout';

const atrasar = <T>(ms: number, valor: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(valor), ms));

describe('comTimeout', () => {
  it('devolve o valor quando a promessa assenta a tempo', async () => {
    await expect(comTimeout(atrasar(5, 'ok'), 1000, 'prazo')).resolves.toBe('ok');
  });

  it('rejeita com a mensagem do prazo quando a promessa não assenta', async () => {
    await expect(comTimeout(atrasar(200, 'tarde'), 10, 'Tempo esgotado a ler a página 2'))
      .rejects.toThrow('Tempo esgotado a ler a página 2');
  });

  it('deixa passar a rejeição original', async () => {
    const falha = Promise.reject(new Error('RLS negou'));
    await expect(comTimeout(falha, 1000, 'prazo')).rejects.toThrow('RLS negou');
  });

  it('prazo desactivado (0) devolve a promessa intacta', async () => {
    await expect(comTimeout(atrasar(5, 7), 0, 'prazo')).resolves.toBe(7);
  });

  it('o prazo por página é finito e folgado para rede móvel', () => {
    expect(Number.isFinite(PULL_PAGE_TIMEOUT_MS)).toBe(true);
    expect(PULL_PAGE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(PULL_PAGE_TIMEOUT_MS).toBeLessThanOrEqual(120_000);
  });
});
