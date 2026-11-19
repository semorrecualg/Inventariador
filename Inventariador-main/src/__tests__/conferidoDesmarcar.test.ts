// ============================================================================
// conferidoDesmarcar.test.ts — desmarcar apaga TODAS as provas de conferência.
//
// O ecrã de conciliação punha `_conferido` a 0 mas deixava o `status` em
// «CONFERIDO». Esse texto é lido como conferido pela carga, pelo envio (fila da
// nuvem e lote) e pelo pull: a decisão de desmarcar voltava atrás no primeiro
// ciclo de sincronização. A regra de (des)marcar passa a viver em
// `utils/conferencia.ts`, com a decisão completa num só sítio.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { alternarConferencia, isConferido, statusAoDesmarcar } from '../utils/conferencia';

const ativo = (over: Record<string, unknown> = {}) => ({
  tenantid: 'CICOPAL',
  primarykey: 'A',
  status: 'CONFERIDO',
  _conferido: 1,
  ...over
});

/** O que o envio decide hoje: a flag pela regra única e o status como marcador. */
const envioGravaConferido = (asset: Record<string, unknown>): boolean =>
  isConferido(asset) || String(asset.status || '').toUpperCase().includes('CONFERIDO');

/** O que o pull decide quando a coluna `conferido` ainda não existe. */
const pullLeConferido = (row: Record<string, unknown>): boolean =>
  String(row.status || '').toUpperCase().includes('CONFERIDO');

describe('statusAoDesmarcar — só o marcador de conferência é substituído', () => {
  it('limpa o marcador em qualquer grafia que o app leia', () => {
    expect(statusAoDesmarcar('CONFERIDO')).toBe('PENDENTE');
    expect(statusAoDesmarcar('conferido')).toBe('PENDENTE');
    expect(statusAoDesmarcar('CONFERIDO (PERFEITO ESTADO)')).toBe('PENDENTE');
  });

  it('preserva um status de outro teor', () => {
    expect(statusAoDesmarcar('EM USO')).toBe('EM USO');
    expect(statusAoDesmarcar('BAIXADO')).toBe('BAIXADO');
  });
});

describe('alternarConferencia — a decisão não deixa provas contraditórias', () => {
  it('desmarcar desliga flag, status e coluna de auditoria de uma vez', () => {
    const patch = alternarConferencia(ativo({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }));
    const depois = { ...ativo({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }), ...patch };

    expect(patch._conferido).toBe(false);
    expect(patch.status).toBe('PENDENTE');
    expect(patch.AUDITOR_STATUS_CONFERENCIA).toBe('NAO');
    expect(patch._dataLeitura).toBeUndefined();
    expect(isConferido(depois)).toBe(false);
  });

  it('o envio e o pull deixam de ver conferência no item desmarcado', () => {
    const patch = alternarConferencia(ativo());
    const depois = { ...ativo(), ...patch };

    // Envio (supabaseService/syncService) e leitura legada do pull.
    expect(envioGravaConferido(depois)).toBe(false);
    expect(pullLeConferido(depois)).toBe(false);

    // Antes da correção o status ficava CONFERIDO e ambos diziam que sim.
    expect(pullLeConferido({ ...ativo(), _conferido: false })).toBe(true);
  });

  it('marcar devolve a flag e a data, sem tocar no status', () => {
    const patch = alternarConferencia(ativo({ _conferido: 0, status: 'EM USO' }), '2026-11-19T10:00:00.000Z');

    expect(patch).toEqual({ _conferido: true, _dataLeitura: '2026-11-19T10:00:00.000Z' });
  });
});
