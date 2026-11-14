// ============================================================================
// syncQueueGuards.test.ts — tempo limite do pedido e watchdog da trava.
//
// Contexto real (2026-11-12, filial 010101 CICOPAL GO): 45 ativos conferidos,
// 15 chegaram à nuvem e todos os 45 continuaram "PENDENTE NUVEM". A causa foi um
// pedido ao Supabase sem limite de tempo que pendurou o ciclo e deixou a trava
// `isSyncRunningRef` presa em `true` para sempre. Estes testes fixam as duas
// guardas que impedem a repetição.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  UPSERT_TIMEOUT_MS,
  SYNC_CYCLE_STUCK_MS,
  SyncRequestTimeoutError,
  isSyncLockStuck,
  withUpsertTimeout
} from '../services/syncQueueGuards';

describe('withUpsertTimeout — nenhum pedido fica pendurado', () => {
  afterEach(() => vi.useRealTimers());

  it('devolve o resultado quando a nuvem responde a tempo', async () => {
    await expect(withUpsertTimeout(Promise.resolve({ error: null }), 1000))
      .resolves.toEqual({ error: null });
  });

  it('propaga o erro real da nuvem sem mascarar', async () => {
    const falha = new Error('permission denied');
    await expect(withUpsertTimeout(Promise.reject(falha), 1000)).rejects.toBe(falha);
  });

  it('desiste ao fim de 15 s e sinaliza tempo esgotado', async () => {
    vi.useFakeTimers();
    const pendente = withUpsertTimeout(new Promise<never>(() => {}), UPSERT_TIMEOUT_MS);
    const verificacao = expect(pendente).rejects.toBeInstanceOf(SyncRequestTimeoutError);

    await vi.advanceTimersByTimeAsync(UPSERT_TIMEOUT_MS - 1);
    // Ainda dentro do prazo: nada foi decidido.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(2);
    await verificacao;
  });

  it('não deixa temporizador pendente quando o pedido termina antes', async () => {
    vi.useFakeTimers();
    await withUpsertTimeout(Promise.resolve({ error: null }), UPSERT_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('isSyncLockStuck — watchdog da trava do ciclo', () => {
  const agora = 1_700_000_000_000;

  it('ciclo em andamento dentro do prazo não é preso', () => {
    expect(isSyncLockStuck(true, agora - 1000, agora)).toBe(false);
  });

  it('liberta quando o ciclo passa de 2 minutos', () => {
    expect(isSyncLockStuck(true, agora - (SYNC_CYCLE_STUCK_MS + 1), agora)).toBe(true);
  });

  it('trava sem ciclo iniciado (0) nunca é tratada como presa', () => {
    expect(isSyncLockStuck(true, 0, agora)).toBe(false);
  });

  it('sem ciclo em andamento nada a libertar', () => {
    expect(isSyncLockStuck(false, agora - SYNC_CYCLE_STUCK_MS * 2, agora)).toBe(false);
  });

  it('relógio que anda para trás não liberta a trava', () => {
    expect(isSyncLockStuck(true, agora + 5000, agora)).toBe(false);
  });
});
