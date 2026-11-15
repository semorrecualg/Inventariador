// @vitest-environment node
// ============================================================================
// pullMerge.test.ts — o que acontece à base local carregada quando chega um pull.
//
// Em BASE OFICIAL o pull substituía o inventário pelo que a nuvem devolveu. Uma
// planilha carregada há pouco (`_is_synced = 0`) ainda não está na nuvem: sumia
// do ecrã e a Unidade Operacional dizia "nenhum dado importado".
// ============================================================================
import { describe, it, expect } from 'vitest';
import { fundirPullComPendentes } from '../services/pullMerge';

const linha = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  primarykey: id,
  tenantid: 'CICOPAL',
  _is_synced: 0,
  ...over
});

describe('fundirPullComPendentes', () => {
  it('nuvem vazia + base carregada do mesmo contrato: mantém os pendentes', () => {
    const r = fundirPullComPendentes({
      daNuvem: [],
      locais: [linha('A'), linha('B')],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.mantidos).toBe(2);
    expect(r.assets.map((a) => a.id)).toEqual(['A', 'B']);
  });

  it('a nuvem manda sobre a mesma chave', () => {
    const r = fundirPullComPendentes({
      daNuvem: [{ id: 'A', tenantid: 'CICOPAL', descricao: 'da nuvem' }],
      locais: [linha('A', { descricao: 'local' })],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.assets).toHaveLength(1);
    expect(r.assets[0].descricao).toBe('da nuvem');
    expect(r.mantidos).toBe(0);
  });

  it('pendente que a nuvem ainda não tem fica no fim, somado ao que veio', () => {
    const r = fundirPullComPendentes({
      daNuvem: [{ id: 'A', tenantid: 'CICOPAL' }],
      locais: [linha('A'), linha('NOVA')],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.assets.map((a) => a.id)).toEqual(['A', 'NOVA']);
    expect(r.mantidos).toBe(1);
  });

  it('linha já sincronizada que a nuvem deixou de devolver não ressuscita', () => {
    const r = fundirPullComPendentes({
      daNuvem: [],
      locais: [linha('APAGADA', { _is_synced: 1 })],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.assets).toEqual([]);
    expect(r.mantidos).toBe(0);
  });

  it('pendente de OUTRO contrato nunca entra no inventário', () => {
    const r = fundirPullComPendentes({
      daNuvem: [{ id: 'A' }],
      locais: [linha('X', { tenantid: 'CLIENTETESTE' })],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.assets.map((a) => a.id)).toEqual(['A']);
    expect(r.deOutroContrato).toBe(1);
  });

  it('sem contrato activo não se preserva nada (não há como isolar)', () => {
    const r = fundirPullComPendentes({
      daNuvem: [],
      locais: [linha('A', { tenantid: '' })],
      contratoAtivo: ''
    });

    expect(r.assets).toEqual([]);
    expect(r.mantidos).toBe(0);
  });

  it('normaliza maiúsculas e espaços do contrato', () => {
    const r = fundirPullComPendentes({
      daNuvem: [],
      locais: [linha('A', { tenantid: ' cicopal ' })],
      contratoAtivo: 'CICOPAL'
    });

    expect(r.mantidos).toBe(1);
  });
});
