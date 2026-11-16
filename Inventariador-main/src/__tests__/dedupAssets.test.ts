import { describe, it, expect } from 'vitest';
import { buildDedupPlan, assetIdentityKey, pickKeeper, type DedupRow } from '../utils/dedupAssets';

const row = (over: Partial<DedupRow> & { primarykey: string }): DedupRow => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  filial_raw: '010101 CICOPAL GO',
  etiqueta: '01010100000049670018',
  registro: 'R-1',
  subreg: '1',
  descricaodoativo: 'CADEIRA GIRATORIA',
  serial: 'SN-1',
  qt: 1,
  _conferido: 0,
  _is_synced: 0,
  ...over
});

/**
 * A limpeza existe porque o mesmo conjunto foi gravado várias vezes com
 * `primarykey` diferente (50 544 = 4 × 12 636), e o `bulkPut` não substitui
 * chaves diferentes.
 *
 * Mas a etiqueta NÃO identifica um ativo: a planilha contábil repete-a entre
 * linhas distintas, e a carga passou a preservar essas linhas com a chave do
 * ERP (código da filial + registro + subreg). Agrupar por etiqueta apagava-as.
 */
describe('dedupAssets — plano de limpeza de cópias', () => {
  it('mantém uma linha por identidade do ERP + conteúdo e remove as cópias', () => {
    const rows = [
      row({ primarykey: 'A' }),
      row({ primarykey: 'B' }),
      row({ primarykey: 'C', _is_synced: 1 }),
      row({ primarykey: 'D', tenantid: 'OUTRO' })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.total).toBe(4);
    expect(plan.duplicates).toBe(2);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].keeper.primarykey).toBe('C'); // sincronizada vence
    expect(plan.groups[0].removed.map((r) => r.primarykey).sort()).toEqual(['A', 'B']);
  });

  it('não apaga linhas que a carga preservou: mesma etiqueta, registros diferentes', () => {
    const rows = [
      row({ primarykey: '01010110011', etiqueta: '000420', registro: '1001', subreg: '1' }),
      row({ primarykey: '01010110021', etiqueta: '000420', registro: '1002', subreg: '1' }),
      row({ primarykey: '01010110031', etiqueta: '000420', registro: '1003', subreg: '1' })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.withoutIdentity).toBe(0);
  });

  it('mesma identidade de ERP com conteúdos diferentes são ativos distintos', () => {
    const rows = [
      row({ primarykey: '01010110011', registro: '1001', subreg: '1', descricaodoativo: 'CADEIRA' }),
      row({ primarykey: '01010110011-2', registro: '1001', subreg: '1', descricaodoativo: 'MESA' })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
  });

  it('não apaga o registo conferido, nem perde autor e data da conferência', () => {
    const rows = [
      row({ primarykey: 'A', _is_synced: 1 }),
      row({ primarykey: 'B', _conferido: 1 }),
      row({ primarykey: 'C', _auditor: 'semorr@gmail.com', _dataLeitura: '2026-11-12T10:00:00Z' })
    ];

    const plan = buildDedupPlan(rows);
    const group = plan.groups[0];
    expect(group.keeper.primarykey).toBe('B');
    expect(group.patch._auditor).toBe('semorr@gmail.com');
    expect(group.patch._dataLeitura).toBe('2026-11-12T10:00:00Z');
    expect(group.removed.map((r) => r.primarykey).sort()).toEqual(['A', 'C']);
  });

  it('prefere o updated_at mais recente quando a linha desceu da nuvem', () => {
    const rows = [
      row({ primarykey: 'A', updated_at: '2026-11-01T00:00:00Z' }),
      row({ primarykey: 'B', updated_at: '2026-11-12T00:00:00Z' }),
      row({ primarykey: 'C', updated_at: '2026-10-01T00:00:00Z' })
    ];

    expect(buildDedupPlan(rows).groups[0].keeper.primarykey).toBe('B');
  });

  it('agrupa grafias equivalentes da filial (acentos, hífen, maiúsculas, nome)', () => {
    const rows = [
      row({ primarykey: 'A', filial_raw: '010101 Cicopal-GO' }),
      row({ primarykey: 'B', filial_raw: '  010101   CICOPAL GO ' }),
      row({ primarykey: 'C', filial_raw: '010101' })
    ];

    expect(assetIdentityKey(rows[0])).toBe(assetIdentityKey(rows[1]));
    expect(assetIdentityKey(rows[0])).toBe(assetIdentityKey(rows[2]));
    expect(buildDedupPlan(rows).duplicates).toBe(2);
  });

  it('sem identidade de ERP, não agrupa por etiqueta (padrão seguro)', () => {
    const rows = [
      row({ primarykey: 'A', registro: null, subreg: null }),
      row({ primarykey: 'B', registro: null, subreg: null }),
      row({ primarykey: 'C', registro: null, subreg: null })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.withoutIdentity).toBe(3);
  });

  it('só agrupa por etiqueta quando a confirmação é explícita', () => {
    const comConteudoIgual = [
      row({ primarykey: 'A', registro: null, subreg: null, _is_synced: 1 }),
      row({ primarykey: 'B', registro: null, subreg: null })
    ];

    const plan = buildDedupPlan(comConteudoIgual, { confirmEtiquetaDuplicates: true });
    expect(plan.duplicates).toBe(1);
    expect(plan.groups[0].keeper.primarykey).toBe('A');

    // Mesmo no modo antigo, conteúdo diferente não é cópia.
    const conteudosDiferentes = [
      row({ primarykey: 'A', registro: null, subreg: null, serial: 'SN-1' }),
      row({ primarykey: 'B', registro: null, subreg: null, serial: 'SN-2' })
    ];
    expect(buildDedupPlan(conteudosDiferentes, { confirmEtiquetaDuplicates: true }).duplicates).toBe(0);
  });

  it('separa contratos diferentes com a mesma identidade de ERP', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: 'CICOPAL' }),
      row({ primarykey: 'B', tenantid: 'OUTRO' }),
      row({ primarykey: 'C', tenantid: 'CICOPAL' })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(1);
    expect(plan.groups[0].removed).toHaveLength(1);
  });

  it('é determinístico: repetir a limpeza não muda a escolha', () => {
    const rows = [row({ primarykey: 'A' }), row({ primarykey: 'B' }), row({ primarykey: 'C' })];
    const first = pickKeeper(rows).primarykey;
    const second = pickKeeper([...rows].reverse()).primarykey;
    expect(first).toBe(second);
    expect(first).toBe('C'); // desempate pelo primarykey maior
  });

  it('base sem cópias não gera plano de remoção', () => {
    const rows = [
      row({ primarykey: 'A', registro: 'R-1' }),
      row({ primarykey: 'B', registro: 'R-2' })
    ];
    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.total).toBe(2);
  });
});
