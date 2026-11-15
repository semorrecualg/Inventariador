import { describe, it, expect } from 'vitest';
import { buildDedupPlan, assetIdentityKey, pickKeeper, type DedupRow } from '../utils/dedupAssets';

const row = (over: Partial<DedupRow> & { primarykey: string }): DedupRow => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  etiqueta: '01010100000049670018',
  _conferido: 0,
  _is_synced: 0,
  ...over
});

/**
 * A limpeza por tenantid + filial + etiqueta existe porque o mesmo conjunto foi
 * gravado várias vezes com `primarykey` diferente (50 544 = 4 × 12 636), e o
 * `bulkPut` não substitui chaves diferentes.
 */
describe('dedupAssets — plano de limpeza de cópias', () => {
  it('mantém uma linha por tenantid + filial + etiqueta e remove as cópias', () => {
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

  it('nunca apaga o registo conferido, nem perde autor e data da conferência', () => {
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

  it('agrupa grafias equivalentes da filial (acentos, hífen, maiúsculas)', () => {
    const rows = [
      row({ primarykey: 'A', filial_raw: '010101 Cicopal-GO' }),
      row({ primarykey: 'B', filial_raw: '  010101   CICOPAL GO ' })
    ];

    expect(assetIdentityKey(rows[0])).toBe(assetIdentityKey(rows[1]));
    expect(buildDedupPlan(rows).duplicates).toBe(1);
  });

  it('não toca em ativos sem etiqueta: falta identidade, não se apaga', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: '' }),
      row({ primarykey: 'B', etiqueta: '' }),
      row({ primarykey: 'C', etiqueta: null as unknown as string })
    ];

    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.withoutIdentity).toBe(3);
  });

  it('separa contratos diferentes com a mesma etiqueta', () => {
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
      row({ primarykey: 'A', etiqueta: 'E1' }),
      row({ primarykey: 'B', etiqueta: 'E2' })
    ];
    const plan = buildDedupPlan(rows);
    expect(plan.duplicates).toBe(0);
    expect(plan.groups).toHaveLength(0);
    expect(plan.total).toBe(2);
  });
});
