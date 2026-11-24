// @vitest-environment node
// ============================================================================
// supabaseProjectRef.test.ts — o ref mostrado no login tem de ser o do projeto
// que o pedido de /auth/v1/token vai realmente contactar.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { refDoProjetoSupabase } from '../utils/supabaseProjectRef';

describe('refDoProjetoSupabase', () => {
  it('extrai o ref de um projeto gerido', () => {
    expect(refDoProjetoSupabase('https://abcdefghijkl.supabase.co')).toBe('abcdefghijkl');
    expect(refDoProjetoSupabase('https://abc123.supabase.co/')).toBe('abc123');
    expect(refDoProjetoSupabase('  HTTPS://ABC123.SUPABASE.CO  ')).toBe('abc123');
  });

  it('devolve o host em domínio próprio, onde não há ref', () => {
    expect(refDoProjetoSupabase('https://api.minhaempresa.com')).toBe('api.minhaempresa.com');
  });

  it('sem URL válida não mostra nada', () => {
    expect(refDoProjetoSupabase('')).toBe('');
    expect(refDoProjetoSupabase('   ')).toBe('');
    expect(refDoProjetoSupabase(undefined)).toBe('');
    expect(refDoProjetoSupabase(null)).toBe('');
    expect(refDoProjetoSupabase('sem-url')).toBe('');
  });
});
