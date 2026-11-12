import { describe, it, expect } from 'vitest';
import { createUnitCounter } from '../utils/unitAssetStats';

describe('unitAssetStats — contagem por unidade em uma passagem', () => {
  it('soma total e conferidos por unidade', () => {
    const counter = createUnitCounter();
    counter.count('010101 CICOPAL GO', 0);
    counter.count('010101 CICOPAL GO', 1);
    counter.count('010101 CICOPAL GO', 0);
    counter.count('010102 CICOPAL GO', 1);

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
    counter.count('010101 Cicopal-GO', 0);
    counter.count('  010101   CICOPAL GO ', 0);
    counter.count('010101 CICOPAL GO', 0);

    expect(counter.entries()).toEqual([{ label: '010101 Cicopal-GO', total: 3, checked: 0 }]);
  });

  it('aceita conferido como 1, "1" ou true', () => {
    const counter = createUnitCounter();
    counter.count('U1', 1);
    counter.count('U1', '1');
    counter.count('U1', true);
    counter.count('U1', 0);
    counter.count('U1', undefined);

    expect(counter.entries()[0]).toEqual({ label: 'U1', total: 5, checked: 3 });
  });

  it('rótulos conhecidos (props/GPS) aparecem com zero ativos sem contar nada', () => {
    const counter = createUnitCounter();
    counter.addLabel('010103 CICOPAL GO');
    counter.count('010101 CICOPAL GO', 0);

    const entries = counter.entries();
    expect(entries).toEqual([
      { label: '010103 CICOPAL GO', total: 0, checked: 0 },
      { label: '010101 CICOPAL GO', total: 1, checked: 0 }
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
});
