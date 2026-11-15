// @vitest-environment node
// ============================================================================
// sessionMode.test.ts — o login manda, o modo guardado não.
//
// Regressão: MASTER do CICOPAL autenticava no Supabase e a app ficava em
// INTERNAL porque `app_database_mode` já era INTERNAL (demo/carga local
// anterior). Sem modo SUPABASE o `syncFromCloud` nunca corria — base vazia,
// "nenhuma filial na base deste contrato".
// ============================================================================
import { describe, it, expect } from 'vitest';
import { deveEntrarEmModoNuvem } from '../utils/sessionMode';

describe('deveEntrarEmModoNuvem', () => {
  it('login no Supabase com credenciais no build entra em BASE OFICIAL', () => {
    expect(deveEntrarEmModoNuvem('SUPABASE', true)).toBe(true);
  });

  it('credencial local do app fica em BASE LOCAL, mesmo com credenciais no build', () => {
    expect(deveEntrarEmModoNuvem('LOCAL', true)).toBe(false);
  });

  it('login Supabase num build sem credenciais não tenta a nuvem', () => {
    expect(deveEntrarEmModoNuvem('SUPABASE', false)).toBe(false);
  });

  it('credencial local num build sem credenciais fica em BASE LOCAL', () => {
    expect(deveEntrarEmModoNuvem('LOCAL', false)).toBe(false);
  });

  it('origem desconhecida segue o ambiente do build (auto-login/legado)', () => {
    expect(deveEntrarEmModoNuvem(undefined, true)).toBe(true);
    expect(deveEntrarEmModoNuvem(null, false)).toBe(false);
  });
});
