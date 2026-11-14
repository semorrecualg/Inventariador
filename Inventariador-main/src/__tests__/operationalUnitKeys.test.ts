import { describe, it, expect } from 'vitest';
import { unitContextKey, filterPhantomConfigKeys } from '../utils/unitContextUtils';

const UNIT = '010101 CICOPAL GO';

describe('filterPhantomConfigKeys', () => {
  it('remove config sem contrato que duplicaria a unidade já identificada pelos ativos', () => {
    const assets = [unitContextKey('CICOPAL', UNIT)];
    const configs = [unitContextKey('', UNIT)];
    expect(filterPhantomConfigKeys(assets, configs)).toEqual([]);
  });

  it('mantém config com o MESMO contrato dos ativos', () => {
    const assets = [unitContextKey('CICOPAL', UNIT)];
    const configs = [unitContextKey('CICOPAL', UNIT)];
    expect(filterPhantomConfigKeys(assets, configs)).toEqual([unitContextKey('CICOPAL', UNIT)]);
  });

  it('mantém config sem contrato quando NENHUM ativo define o contrato da filial', () => {
    const assets = [unitContextKey('CICOPAL', '020202 OUTRA GO')];
    const configs = [unitContextKey('', UNIT)];
    expect(filterPhantomConfigKeys(assets, configs)).toEqual([unitContextKey('', UNIT)]);
  });

  it('mantém config sem contrato quando os ativos da filial também não têm contrato', () => {
    const assets = [unitContextKey('', UNIT)];
    const configs = [unitContextKey('', UNIT)];
    expect(filterPhantomConfigKeys(assets, configs)).toEqual([unitContextKey('', UNIT)]);
  });
});
