import { describe, it, expect } from 'vitest';
import { getDatabaseMode, isInternalMode } from '../services/supabaseService';

/** O CI corre a suíte duas vezes; a variante chega por TEST_DB_MODE. */
const MODO_NUVEM = process.env.TEST_DB_MODE === 'supabase';

describe('ambiente de testes', () => {
  it('fornece localStorage em memória', () => {
    localStorage.clear();
    localStorage.setItem('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    expect(localStorage.length).toBe(1);
    expect(localStorage.key(0)).toBe('k');
    localStorage.removeItem('k');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('fornece sessionStorage em memória', () => {
    sessionStorage.clear();
    sessionStorage.setItem('s', '1');
    expect(sessionStorage.getItem('s')).toBe('1');
    sessionStorage.clear();
    expect(sessionStorage.length).toBe(0);
  });

  it('configura o modo de base de dados pedido, ignorando o shell', () => {
    expect(isInternalMode).toBe(!MODO_NUVEM);
    expect(getDatabaseMode()).toBe(MODO_NUVEM ? 'SUPABASE' : 'INTERNAL');
  });
});
