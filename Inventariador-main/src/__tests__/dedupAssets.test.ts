import { describe, it, expect } from 'vitest';
import {
  buildDedupPlan,
  assetIdentityKey,
  pickKeeper,
  summarizeDuplicateAssetKeys,
  uniqueAssetsForDisplay,
  type DedupRow
} from '../utils/dedupAssets';

/** Linha de teste: os campos do plano de cópias + os campos do BEM que o ecrã lê. */
type LinhaDeTeste = DedupRow & {
  descricaodoativo?: string;
  serial?: string;
  dataaqusic?: string;
  qt?: number;
};

const row = (over: Partial<LinhaDeTeste> & { primarykey: string }): LinhaDeTeste => ({
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

  it('a coluna de auditoria também elege o keeper (a conferência não desaparece)', () => {
    const rows = [
      row({ primarykey: 'A', _is_synced: 1 }),
      row({ primarykey: 'B', AUDITOR_STATUS_CONFERENCIA: 'SIM' }),
      row({ primarykey: 'C' })
    ];

    const group = buildDedupPlan(rows).groups[0];
    // B não tem a flag gravada, mas a planilha diz que está conferido: a cópia
    // sincronizada de A não pode ganhar e levar a auditoria consigo.
    expect(group.keeper.primarykey).toBe('B');
    expect(group.patch._conferido).toBeUndefined();
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

/**
 * O ecrã conta e lista ATIVOS, não linhas: a mesma `primarykey` pode estar
 * gravada com o contrato do perfil e com `tenantid` vazio (carga antiga), e as
 * duas cópias convivem na chave composta [tenantid+primarykey]. Com chaves
 * diferentes, a mesma filial+etiqueta+descrição também é a mesma linha
 * importada duas vezes.
 */
describe('uniqueAssetsForDisplay — o ativo aparece uma vez', () => {
  it('colapsa a mesma primarykey e prefere a linha do contrato ativo', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: '', etiqueta: 'E1' }),
      row({ primarykey: 'A', tenantid: 'CICOPAL', etiqueta: 'E1' })
    ];

    const unicos = uniqueAssetsForDisplay(rows, 'CICOPAL');
    expect(unicos).toHaveLength(1);
    expect(unicos[0].tenantid).toBe('CICOPAL');
  });

  it('mantém identidades e linhas sem chave diferentes', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: 'E1' }),
      row({ primarykey: 'B', etiqueta: 'E2' }),
      row({ primarykey: '', etiqueta: 'E3' })
    ];

    expect(uniqueAssetsForDisplay(rows, 'CICOPAL')).toHaveLength(3);
  });

  it('colapsa primarykeys diferentes com a mesma filial, etiqueta e descrição do bem', () => {
    const bem = { descricaodoativo: 'ESTANTE ESC PES CANT AC 6P CZA', serial: '90X30X180', dataaqusic: '2013-03-01', qt: 1 };
    const rows = [
      row({ primarykey: 'A', etiqueta: '005046', ...bem }),
      row({ primarykey: 'B', etiqueta: '005046', ...bem })
    ];

    expect(uniqueAssetsForDisplay(rows, 'CICOPAL')).toHaveLength(1);
  });

  it('mantém registos com a mesma etiqueta que descrevem bens diferentes', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: '005046', descricaodoativo: 'ESTANTE' }),
      row({ primarykey: 'B', etiqueta: '005046', descricaodoativo: 'CADEIRA' })
    ];

    expect(uniqueAssetsForDisplay(rows, 'CICOPAL')).toHaveLength(2);
  });

  it('preserva a ordem e fica com a cópia conferida', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: 'E1', _conferido: 0 }),
      row({ primarykey: 'B', etiqueta: 'E2', _conferido: 0 }),
      row({ primarykey: 'B', etiqueta: 'E2', _conferido: 1 })
    ];

    const unicos = uniqueAssetsForDisplay(rows, 'CICOPAL');
    expect(unicos.map((r) => r.primarykey)).toEqual(['A', 'B']);
    expect(unicos[1]._conferido).toBe(1);
  });
});

describe('summarizeDuplicateAssetKeys — mesma primarykey ou chaves diferentes', () => {
  it('conta como mesma chave quando a cópia só muda de contrato', () => {
    const rows = [
      row({ primarykey: 'A', tenantid: '', etiqueta: '005046' }),
      row({ primarykey: 'A', tenantid: 'CICOPAL', etiqueta: '005046' })
    ];

    const resumo = summarizeDuplicateAssetKeys(rows);
    expect(resumo.grupos).toBe(1);
    expect(resumo.mesmaChave).toBe(1);
    expect(resumo.chavesDiferentes).toBe(0);
    expect(resumo.exemplos[0].chaves).toEqual(['A']);
  });

  it('conta como chaves diferentes e mostra as chaves do grupo', () => {
    const rows = [
      row({ primarykey: '0000002345', etiqueta: '005046' }),
      row({ primarykey: '005046', etiqueta: '005046' })
    ];

    const resumo = summarizeDuplicateAssetKeys(rows);
    expect(resumo.grupos).toBe(1);
    expect(resumo.mesmaChave).toBe(0);
    expect(resumo.chavesDiferentes).toBe(1);
    expect(resumo.exemplos[0]).toMatchObject({
      identidade: '010101 CICOPAL GO · 005046',
      linhas: 2,
      chaves: ['0000002345', '005046']
    });
  });

  it('ignora etiquetas-placeholder (não são identidade de ativo)', () => {
    const rows = [
      row({ primarykey: 'A', etiqueta: 'ETIQUETAR' }),
      row({ primarykey: 'B', etiqueta: 'ETIQUETAR' })
    ];

    expect(summarizeDuplicateAssetKeys(rows).grupos).toBe(0);
  });
});
