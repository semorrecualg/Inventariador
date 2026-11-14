import { describe, it, expect } from 'vitest';
import { isInternalMode } from '../services/supabaseService';

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

  it('ignora credenciais Supabase vindas do shell', () => {
    expect(isInternalMode).toBe(true);
  });
});
