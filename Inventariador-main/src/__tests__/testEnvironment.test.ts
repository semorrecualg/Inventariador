import { describe, it, expect } from 'vitest';

// O modo da passagem (INTERNAL × SUPABASE_PLUS) é exigido no canário de nuvem
// (cloudPath.test.ts). Aqui só se prova o armazenamento em memória.
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
});
