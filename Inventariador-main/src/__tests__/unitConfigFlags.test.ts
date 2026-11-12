import { describe, it, expect } from 'vitest';
import {
  buildUnitFlags,
  mergeUnitFlags,
  pickUnitFlags
} from '../utils/unitConfigFlags';

describe('buildUnitFlags — o que sobe para a nuvem', () => {
  it('marca hasGps pela âncora real, não pela preferência', () => {
    expect(buildUnitFlags({}, true).hasGps).toBe(true);
    expect(buildUnitFlags({ hasGps: false }, false).hasGps).toBe(false);
    // Preferência antiga não inventa âncora.
    expect(buildUnitFlags({ hasGps: true }, false).hasGps).toBe(true);
  });

  it('só envia flags definidas (um aparelho não apaga a regra do outro)', () => {
    const flags = buildUnitFlags({ requireNf: true }, true);
    expect(flags).toEqual({ hasGps: true, requireNf: true });
    expect('requireSeriado' in flags).toBe(false);
    expect('allowWriteOffs' in flags).toBe(false);
  });

  it('preserva false explícito', () => {
    expect(buildUnitFlags({ allowWriteOffs: false }, true)).toEqual({
      hasGps: true,
      allowWriteOffs: false
    });
  });
});

describe('pickUnitFlags — o que desce da nuvem', () => {
  it('ignora lixo, null e chaves desconhecidas', () => {
    expect(pickUnitFlags(null)).toEqual({});
    expect(pickUnitFlags('x')).toEqual({});
    expect(pickUnitFlags({ requireNf: 'sim', evil: true, allowNewAssets: true })).toEqual({
      allowNewAssets: true
    });
  });

  it('aceita o objeto completo', () => {
    expect(
      pickUnitFlags({
        hasGps: true,
        requireNf: true,
        requireSeriado: false,
        requirePlaqueta: true,
        allowNewAssets: true,
        allowWriteOffs: false
      })
    ).toEqual({
      hasGps: true,
      requireNf: true,
      requireSeriado: false,
      requirePlaqueta: true,
      allowNewAssets: true,
      allowWriteOffs: false
    });
  });
});

describe('mergeUnitFlags — flags da nuvem sobre a config local', () => {
  it('mantém âncora e raio e aplica só as flags', () => {
    const config = {
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      lat: -16.7,
      lng: -49.1,
      radius_meters: 500
    };
    const merged = mergeUnitFlags(config, { requireNf: true, lixo: 1 });
    expect(merged).toEqual({ ...config, requireNf: true });
  });

  it('sem flags válidas devolve a MESMA referência', () => {
    const config = { filial: 'X' };
    expect(mergeUnitFlags(config, undefined)).toBe(config);
  });
});
