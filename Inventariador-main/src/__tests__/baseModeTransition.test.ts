// ============================================================================
// baseModeTransition.test.ts — a decisão do seletor «Modo de Base».
//
// Fixa as invariantes que o utilizador sente na mão:
//  • offline nunca troca para a nuvem (blindagem e modo intactos);
//  • build sem chaves é recusado antes de qualquer outra coisa;
//  • aparelho blindado e online cai no desbloqueio guiado (um só fluxo);
//  • Base Local troca offline e não depende de rede.
// ============================================================================
import { describe, it, expect } from 'vitest';

import { DatabaseMode } from '../types';
import { planBaseModeSwitch } from '../utils/baseModeTransition';

const base = {
  current: DatabaseMode.INTERNAL,
  target: DatabaseMode.SUPABASE,
  hasCloudKeys: true,
  isOnline: true,
  isLocked: false
};

describe('planBaseModeSwitch — seletor de base', () => {
  it('não faz nada quando o modo pedido já está ativo', () => {
    expect(planBaseModeSwitch({ ...base, target: DatabaseMode.INTERNAL })).toEqual({ action: 'same' });
  });

  it('recusa a Base Oficial em build sem as chaves do Supabase', () => {
    expect(planBaseModeSwitch({ ...base, hasCloudKeys: false })).toEqual({ action: 'missing-keys' });
  });

  it('offline bloqueia a Base Oficial mesmo com chaves e blindagem ativa', () => {
    // A ordem importa: a rede é validada antes de mexer no selo.
    expect(planBaseModeSwitch({ ...base, isOnline: false, isLocked: true })).toEqual({ action: 'offline' });
  });

  it('online e blindado cai no desbloqueio guiado (um único fluxo)', () => {
    expect(planBaseModeSwitch({ ...base, isLocked: true })).toEqual({ action: 'unseal-and-switch' });
  });

  it('online e sem blindagem troca directamente', () => {
    expect(planBaseModeSwitch(base)).toEqual({ action: 'switch' });
  });

  it('Base Local funciona offline e com blindagem ativa (não exige rede)', () => {
    expect(
      planBaseModeSwitch({
        current: DatabaseMode.SUPABASE,
        target: DatabaseMode.INTERNAL,
        hasCloudKeys: false,
        isOnline: false,
        isLocked: true
      })
    ).toEqual({ action: 'switch' });
  });
});
