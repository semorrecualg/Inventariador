import { describe, it, expect } from 'vitest';
import { createUnitCounter, dropGhostUnits, normalizeLegacyTenants } from '../utils/unitAssetStats';

describe('unitAssetStats — contagem por unidade em uma passagem', () => {
  it('soma total e conferidos por unidade', () => {
    const counter = createUnitCounter();
    counter.count('010101 CICOPAL GO', 0);
    counter.count('010101 CICOPAL GO', 1);
    counter.count('010101 CICOPAL GO', 0);
    counter.count('010102 CICOPAL GO', 1);

    const entries = counter.entries();
    expect(entries.find(e => e.label === '010101 CICOPAL GO')).toEqual({
      label: '010101 CICOPAL GO',
      tenantid: '',
      total: 3,
      checked: 1
    });
    expect(entries.find(e => e.label === '010102 CICOPAL GO')).toEqual({
      label: '010102 CICOPAL GO',
      tenantid: '',
      total: 1,
      checked: 1
    });
  });

  it('agrupa grafias equivalentes (maiúsculas, acentos, hífens) e mantém o primeiro rótulo', () => {
    const counter = createUnitCounter();
    counter.count('010101 Cicopal-GO', 0);
    counter.count('  010101   CICOPAL GO ', 0);
    counter.count('010101 CICOPAL GO', 0);

    expect(counter.entries()).toEqual([
      { label: '010101 Cicopal-GO', tenantid: '', total: 3, checked: 0 }
    ]);
  });

  it('aceita conferido como 1, "1" ou true', () => {
    const counter = createUnitCounter();
    counter.count('U1', 1);
    counter.count('U1', '1');
    counter.count('U1', true);
    counter.count('U1', 0);
    counter.count('U1', undefined);

    expect(counter.entries()[0]).toEqual({ label: 'U1', tenantid: '', total: 5, checked: 3 });
  });

  it('rótulos conhecidos (props/GPS) aparecem com zero ativos sem contar nada', () => {
    const counter = createUnitCounter();
    counter.addLabel('010103 CICOPAL GO');
    counter.count('010101 CICOPAL GO', 0);

    const entries = counter.entries();
    expect(entries).toEqual([
      { label: '010103 CICOPAL GO', tenantid: '', total: 0, checked: 0 },
      { label: '010101 CICOPAL GO', tenantid: '', total: 1, checked: 0 }
    ]);
  });

  it('ignora rótulos vazios ou nulos', () => {
    const counter = createUnitCounter();
    counter.count('', 1);
    counter.count(null, 1);
    counter.count(undefined, 1);
    counter.count('   ', 1);
    counter.addLabel(null);

    expect(counter.entries()).toEqual([]);
  });

  it('separa a mesma filial por contrato e não junta os totais', () => {
    const counter = createUnitCounter();
    counter.count('010101 CICOPAL GO', 0, 'CICOPAL');
    counter.count('010101 CICOPAL GO', 0, ' CICOPAL ');
    counter.count('010101 CICOPAL GO', 0, 'CLIENTETESTE');
    counter.count('010101 CICOPAL GO', 0, '');

    expect(counter.entries()).toEqual([
      { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 2, checked: 0 },
      { label: '010101 CICOPAL GO', tenantid: 'CLIENTETESTE', total: 1, checked: 0 },
      { label: '010101 CICOPAL GO', tenantid: '', total: 1, checked: 0 }
    ]);
  });
});

describe('normalizeLegacyTenants — linhas sem contrato no único contrato da base', () => {
  it('funde «sem contrato» no único contrato presente, somando total e conferidos', () => {
    const merged = normalizeLegacyTenants([
      { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 10, checked: 2 },
      { label: '010101 CICOPAL GO', tenantid: '', total: 5, checked: 1 }
    ]);

    expect(merged).toEqual([
      { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 15, checked: 3 }
    ]);
  });

  it('mantém a unidade sem contrato quando não há contrato nenhum na base', () => {
    const entries = [{ label: '010101 CICOPAL GO', tenantid: '', total: 4, checked: 0 }];
    expect(normalizeLegacyTenants(entries)).toEqual(entries);
  });

  it('não adivinha com dois contratos na base: «sem contrato» fica como está', () => {
    const entries = [
      { label: 'A', tenantid: 'CICOPAL', total: 1, checked: 0 },
      { label: 'A', tenantid: 'CLIENTETESTE', total: 1, checked: 0 },
      { label: 'A', tenantid: '', total: 2, checked: 0 }
    ];
    expect(normalizeLegacyTenants(entries)).toEqual(entries);
  });
});

describe('normalizeLegacyTenants — contrato da sessão como preferência', () => {
  it('com contrato na sessão, «sem contrato» entra nesse contrato mesmo havendo outros na base', () => {
    const merged = normalizeLegacyTenants(
      [
        { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 6, checked: 0 },
        { label: '010101 CICOPAL GO', tenantid: '', total: 4, checked: 0 },
        { label: '010202 OUTRA', tenantid: 'CLIENTETESTE', total: 1, checked: 0 }
      ],
      'cicopal'
    );

    expect(merged).toEqual([
      { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 10, checked: 0 },
      { label: '010202 OUTRA', tenantid: 'CLIENTETESTE', total: 1, checked: 0 }
    ]);
  });
});

describe('dropGhostUnits — cartão vazio da mesma filial', () => {
  it('remove a cópia sem ativos quando a filial tem ativos noutro contrato', () => {
    const entries = [
      { label: 'MATRIZ', tenantid: '', total: 0, checked: 0 },
      { label: 'MATRIZ', tenantid: 'DEMO_DEFAULT', total: 58, checked: 13 }
    ];

    expect(dropGhostUnits(entries)).toEqual([
      { label: 'MATRIZ', tenantid: 'DEMO_DEFAULT', total: 58, checked: 13 }
    ]);
  });

  it('mantém a unidade sem dados quando é a única daquela filial', () => {
    const entries = [
      { label: '010103 CICOPAL GO', tenantid: 'CICOPAL', total: 0, checked: 0 },
      { label: '010101 CICOPAL GO', tenantid: 'CICOPAL', total: 2, checked: 0 }
    ];

    expect(dropGhostUnits(entries)).toEqual(entries);
  });

  it('sem nenhum dado na base, devolve a lista intacta', () => {
    const entries = [{ label: 'MATRIZ', tenantid: '', total: 0, checked: 0 }];
    expect(dropGhostUnits(entries)).toEqual(entries);
  });
});
