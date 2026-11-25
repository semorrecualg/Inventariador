// ============================================================================
// sreProtocol.test.ts — placar LOCAL × SUPABASE do Gestor de Base.
//
// Em BASE LOCAL a nuvem não é consultada: o placar tem de dizer isso, não
// deixar «CONSULTANDO» para sempre (era o sintoma da FIG 3, com a barra
// amarela de BASE LOCAL logo acima).
// ============================================================================
import { describe, it, expect } from 'vitest';

import { CLOUD_STATE_LABEL, formatBasesLine } from '../utils/sreProtocol';

describe('formatBasesLine', () => {
  it('BASE LOCAL não finge uma leitura em curso', () => {
    expect(formatBasesLine(12636, { state: 'local', count: null }))
      .toBe('LOCAL 12636 · SUPABASE — · BASE LOCAL');
  });

  it('sem credenciais diz NÃO CONFIGURADO', () => {
    expect(formatBasesLine(0, { state: 'internal', count: null }))
      .toBe('LOCAL 0 · SUPABASE — · NÃO CONFIGURADO');
  });

  it('online mostra o total lido agora', () => {
    expect(formatBasesLine(12636, { state: 'online', count: 12636 }))
      .toBe('LOCAL 12636 · SUPABASE 12636 · ONLINE');
  });

  it('offline e erro ficam distinguíveis', () => {
    expect(formatBasesLine(1, { state: 'offline', count: null }))
      .toBe('LOCAL 1 · SUPABASE — · OFFLINE');
    expect(formatBasesLine(1, { state: 'error', count: null }))
      .toBe('LOCAL 1 · SUPABASE — · ERRO');
  });
});

describe('CLOUD_STATE_LABEL', () => {
  it('tem rótulo para todos os estados, incluindo o de Base Local', () => {
    expect(CLOUD_STATE_LABEL.local).toBe('não consultada (base local)');
    expect(CLOUD_STATE_LABEL.loading).toBe('consultando');
  });
});
