// @vitest-environment jsdom
// ============================================================================
// sessionProfile.test.ts — Escopo de filial do perfil + origem da sessão.
//
// Cobre os dois defeitos que derrubavam o auditor criado em Acessos para a
// tela de login logo após escolher a filial:
//  1. `user_permissions` grava a filial em `filial`/`units`, mas o auto-login
//     da nuvem só lia `unitid/_unitid` → perfil "sem filial" → fail-safe
//     encerrava a sessão.
//  2. Login por credencial local do app não tem token do Supabase e era
//     tratado como sessão fantasma (purga na checagem de sessão da nuvem).
// ============================================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isAppManagedSession,
  markAppManagedSession,
  resolveProfileUnitId,
} from '../utils/authUtils';

describe('resolveProfileUnitId', () => {
  it('lê a filial da coluna `filial` (grafia usada no provisionamento)', () => {
    expect(resolveProfileUnitId({ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }))
      .toBe('010101 CICOPAL GO');
  });

  it('lê a filial de `unitid`/`_unitid` (perfis antigos)', () => {
    expect(resolveProfileUnitId({ _unitid: 'FILIAL A' })).toBe('FILIAL A');
    expect(resolveProfileUnitId({ unitid: 'FILIAL B' })).toBe('FILIAL B');
  });

  it('usa o primeiro item de `units` quando não há unidade primária', () => {
    expect(resolveProfileUnitId({ units: ['FILIAL C', 'FILIAL D'] })).toBe('FILIAL C');
  });

  it('ignora sentinelas DEFAULT/NULL/0 e cai na próxima fonte', () => {
    expect(
      resolveProfileUnitId({ filial: 'DEFAULT' }, { units: ['NULL'] }, { filial: 'FILIAL E' })
    ).toBe('FILIAL E');
  });

  it('a filial primária tem precedência sobre a lista de units', () => {
    expect(resolveProfileUnitId({ filial: 'FILIAL 2', units: ['FILIAL 1'] })).toBe('FILIAL 2');
  });

  it('retorna vazio quando nenhuma fonte declara filial', () => {
    expect(resolveProfileUnitId(null, undefined, { tenantid: 'CICOPAL', units: [] })).toBe('');
  });

  it('normaliza espaços e maiúsculas do rótulo da filial', () => {
    expect(resolveProfileUnitId({ filial: '  010102 cicopal sp  ' })).toBe('010102 CICOPAL SP');
  });
});

describe('sessão gerida pelo app (credencial local)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('não existe antes de um login local', () => {
    expect(isAppManagedSession()).toBe(false);
  });

  it('existe após o login local e com o usuário no cache de sessão', () => {
    markAppManagedSession();
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'auditor@cicopal.com' }));
    expect(isAppManagedSession()).toBe(true);
  });

  it('não considera a marcação sem usuário no cache (logout remove a chave)', () => {
    markAppManagedSession();
    expect(isAppManagedSession()).toBe(false);
  });
});
