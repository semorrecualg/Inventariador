// ============================================================================
// sovereignty.test.ts — selo de blindagem: chaves, remoção e evento.
// ============================================================================
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

import {
  SOVEREIGNTY_EVENT,
  SOVEREIGNTY_INTEGRITY_KEY,
  SOVEREIGNTY_LOCK_KEY,
  buildIntegrityKey,
  isSovereigntyLocked,
  notifySovereigntyChanged,
  sealSovereignty,
  unsealSovereignty,
  type SovereigntyStore
} from '../utils/sovereignty';

const memoria = (): SovereigntyStore & { valores: Map<string, string> } => {
  const valores = new Map<string, string>();
  return {
    valores,
    getItem: (k) => valores.get(k) ?? null,
    setItem: (k, v) => { valores.set(k, v); },
    removeItem: (k) => { valores.delete(k); }
  };
};

describe('blindagem — selar e remover', () => {
  it('sela com contagem de ativos e chave de verificação estável', () => {
    const store = memoria();

    expect(isSovereigntyLocked(store)).toBe(false);
    const chave = sealSovereignty(store, 42, 'SEED123');

    expect(chave).toBe(buildIntegrityKey(42, 'SEED123'));
    expect(chave).toContain('KARDEX_CONF_LOCKED_42_SEED123');
    expect(store.getItem(SOVEREIGNTY_LOCK_KEY)).toBe('true');
    expect(store.getItem(SOVEREIGNTY_INTEGRITY_KEY)).toBe(chave);
  });

  it('não reescreve a chave de um aparelho já blindado', () => {
    const store = memoria();
    const primeira = sealSovereignty(store, 7, 'AAA');

    expect(sealSovereignty(store, 99, 'BBB')).toBeNull();
    expect(store.getItem(SOVEREIGNTY_INTEGRITY_KEY)).toBe(primeira);
  });

  it('remover a blindagem limpa as duas chaves e é idempotente', () => {
    const store = memoria();
    sealSovereignty(store, 3, 'CCC');

    expect(unsealSovereignty(store)).toBe(true);
    expect(store.getItem(SOVEREIGNTY_LOCK_KEY)).toBeNull();
    expect(store.getItem(SOVEREIGNTY_INTEGRITY_KEY)).toBeNull();
    expect(unsealSovereignty(store)).toBe(false);
  });

  it('avisa as telas abertas por evento global', () => {
    const ouvinte = vi.fn();
    window.addEventListener(SOVEREIGNTY_EVENT, ouvinte);
    try {
      notifySovereigntyChanged();
      expect(ouvinte).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(SOVEREIGNTY_EVENT, ouvinte);
    }
  });
});
