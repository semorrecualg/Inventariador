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
import {
  avisoAposCargaLocal,
  deveEntrarEmModoNuvem,
  origemDaSessaoGuardada
} from '../utils/sessionMode';

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

describe('auto-login (reload) usa a mesma regra do login', () => {
  it('sessão guardada do app (credencial local) fica em BASE LOCAL', () => {
    const origem = origemDaSessaoGuardada(true);
    expect(origem).toBe('LOCAL');
    expect(deveEntrarEmModoNuvem(origem, true)).toBe(false);
  });

  it('sessão Supabase guardada entra em BASE OFICIAL', () => {
    const origem = origemDaSessaoGuardada(false);
    expect(origem).toBe('SUPABASE');
    expect(deveEntrarEmModoNuvem(origem, true)).toBe(true);
  });

  it('credencial local com build sem credenciais continua local', () => {
    expect(deveEntrarEmModoNuvem(origemDaSessaoGuardada(true), false)).toBe(false);
  });
});

describe('avisoAposCargaLocal', () => {
  it('em BASE OFICIAL diz que o modo NÃO foi alterado', () => {
    const aviso = avisoAposCargaLocal({ count: 2, tenantids: ['CICOPAL'], modoActual: 'SUPABASE' });

    expect(aviso.titulo).toMatch(/modo mantido/i);
    expect(aviso.mensagem).toMatch(/NÃO foi alterado/i);
    expect(aviso.mensagem).toContain('CICOPAL');
    expect(aviso.mensagem).toContain('2 ativos');
  });

  it('nunca anuncia a troca para BASE LOCAL que deixou de acontecer', () => {
    for (const modo of ['SUPABASE', 'SUPABASE_PLUS', 'INTERNAL']) {
      const aviso = avisoAposCargaLocal({ count: 1, tenantids: [], modoActual: modo });
      expect(aviso.mensagem).not.toMatch(/passou para o modo BASE LOCAL/i);
    }
  });

  it('em BASE LOCAL fala do que lê a base carregada', () => {
    const aviso = avisoAposCargaLocal({ count: 1, tenantids: [], modoActual: 'INTERNAL' });

    expect(aviso.titulo).toBe('Base local carregada');
    expect(aviso.mensagem).toMatch(/Unidade Operacional/i);
  });
});
