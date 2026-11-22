import { describe, it, expect } from 'vitest';
import { countUnitAssets, createUnitCounter } from '../utils/unitAssetStats';

/** Recorte de ativo: o contador só lê os campos de conferência. */
const ativo = (over: Record<string, unknown> = {}) => ({ _conferido: 0, ...over });

describe('unitAssetStats — contagem por unidade em uma passagem', () => {
  it('soma total e conferidos por unidade', () => {
    const counter = createUnitCounter();
    counter.count('010101 CICOPAL GO', ativo());
    counter.count('010101 CICOPAL GO', ativo({ _conferido: 1 }));
    counter.count('010101 CICOPAL GO', ativo());
    counter.count('010102 CICOPAL GO', ativo({ _conferido: true }));

    const entries = counter.entries();
    const go = entries.find(e => e.label === '010101 CICOPAL GO');
    expect(go).toEqual({ label: '010101 CICOPAL GO', total: 3, checked: 1 });
    expect(entries.find(e => e.label === '010102 CICOPAL GO')).toEqual({
      label: '010102 CICOPAL GO',
      total: 1,
      checked: 1
    });
  });

  it('agrupa grafias equivalentes (maiúsculas, acentos, hífens) e mantém o primeiro rótulo', () => {
    const counter = createUnitCounter();
    counter.count('010101 Cicopal-GO', ativo());
    counter.count('  010101   CICOPAL GO ', ativo());
    counter.count('010101 CICOPAL GO', ativo());

    expect(counter.entries()).toEqual([{ label: '010101 Cicopal-GO', total: 3, checked: 0 }]);
  });

  it('conta pelo predicado único: 1, "1", "true", true e a coluna de auditoria "SIM"', () => {
    const counter = createUnitCounter();
    counter.count('U1', ativo({ _conferido: 1 }));
    counter.count('U1', ativo({ _conferido: '1' }));
    counter.count('U1', ativo({ _conferido: 'true' }));
    counter.count('U1', ativo({ _conferido: true }));
    counter.count('U1', ativo({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }));
    // Pendentes: `'0'`/`'false'` são texto, não conferência (o `!!` antigo os
    // tomava por verdadeiros).
    counter.count('U1', ativo());
    counter.count('U1', ativo({ _conferido: '0' }));
    counter.count('U1', ativo({ _conferido: 'false' }));

    expect(counter.entries()[0]).toEqual({ label: 'U1', total: 8, checked: 5 });
  });

  it('rótulos conhecidos (props/GPS) aparecem com zero ativos sem contar nada', () => {
    const counter = createUnitCounter();
    counter.addLabel('010103 CICOPAL GO');
    counter.count('010101 CICOPAL GO', ativo());

    const entries = counter.entries();
    expect(entries).toEqual([
      { label: '010103 CICOPAL GO', total: 0, checked: 0 },
      { label: '010101 CICOPAL GO', total: 1, checked: 0 }
    ]);
  });

  it('o cartão da filial conta ATIVOS: colapsa a cópia sem contrato', () => {
    const counter = createUnitCounter();
    const rows = [
      { primarykey: 'PK-1', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', _conferido: 0 },
      { primarykey: 'PK-1', tenantid: '', filial: '010101 CICOPAL GO', _conferido: 0 },
      { primarykey: 'PK-2', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', _conferido: 1 }
    ];

    countUnitAssets(rows, 'CICOPAL', counter);

    expect(counter.entries()).toEqual([{ label: '010101 CICOPAL GO', total: 2, checked: 1 }]);
  });

  it('prefere a cópia do contrato ativo (a conferida do resíduo não conta)', () => {
    const counter = createUnitCounter();

    countUnitAssets(
      [
        { primarykey: 'PK-1', tenantid: '', filial: 'U1', _conferido: 1 },
        { primarykey: 'PK-1', tenantid: 'CICOPAL', filial: 'U1', _conferido: 0 }
      ],
      'CICOPAL',
      counter
    );

    expect(counter.entries()).toEqual([{ label: 'U1', total: 1, checked: 0 }]);
  });

  it('conta uma vez as linhas sem primarykey (não são cópia)', () => {
    const counter = createUnitCounter();

    countUnitAssets(
      [
        { primarykey: '', tenantid: 'CICOPAL', filial: 'U1', _conferido: 0 },
        { primarykey: '', tenantid: '', filial: 'U1', _conferido: 0 }
      ],
      'CICOPAL',
      counter
    );

    expect(counter.entries()).toEqual([{ label: 'U1', total: 2, checked: 0 }]);
  });

  it('ignora rótulos vazios ou nulos', () => {
    const counter = createUnitCounter();
    counter.count('', ativo({ _conferido: 1 }));
    counter.count(null, ativo({ _conferido: 1 }));
    counter.count(undefined, ativo({ _conferido: 1 }));
    counter.count('   ', ativo({ _conferido: 1 }));
    counter.addLabel(null);

    expect(counter.entries()).toEqual([]);
  });
});
