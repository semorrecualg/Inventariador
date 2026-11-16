import { describe, it, expect } from 'vitest';
import { getCurrentLocation, isAnchorDerivedLocation, persistableAssetGps, shouldAttemptAssetGpsCapture } from '../utils/gpsUtils';

/**
 * Regra do produto: `assets.gps_lat/gps_lng` só recebe leitura REAL do aparelho.
 * A âncora da unidade é configuração da filial — quando o bypass administrativo
 * a devolve como se fosse posição, ela NÃO pode ser gravada no ativo.
 */
describe('isAnchorDerivedLocation', () => {
  it('reconhece a posição do bypass administrativo por isBypassed', () => {
    expect(isAnchorDerivedLocation({ isBypassed: true })).toBe(true);
    expect(isAnchorDerivedLocation({ isBypassed: true, source: 'native' })).toBe(true);
  });

  it('reconhece a posição do bypass administrativo por source admin_bypass', () => {
    expect(isAnchorDerivedLocation({ source: 'admin_bypass' })).toBe(true);
  });

  it('não classifica leitura nativa como âncora', () => {
    expect(isAnchorDerivedLocation({ isBypassed: false, source: 'native' })).toBe(false);
    expect(isAnchorDerivedLocation({ source: 'native' })).toBe(false);
  });

  it('trata ausência de posição como não-bypass', () => {
    expect(isAnchorDerivedLocation(null)).toBe(false);
    expect(isAnchorDerivedLocation(undefined)).toBe(false);
  });
});

describe('persistableAssetGps (o que pode ir para assets.gps_lat/gps_lng)', () => {
  it('recusa a âncora do bypass: o ativo fica sem GPS', () => {
    expect(
      persistableAssetGps({ lat: -15.7942, lng: -47.8825, isBypassed: true, source: 'admin_bypass' })
    ).toBeNull();
    expect(
      persistableAssetGps({ lat: -15.7942, lng: -47.8825, source: 'admin_bypass' })
    ).toBeNull();
  });

  it('aceita leitura real do aparelho', () => {
    expect(
      persistableAssetGps({ lat: -15.7942, lng: -47.8825, accuracy: 12, source: 'native' })
    ).toEqual({ lat: -15.7942, lng: -47.8825 });
  });

  it('aceita leitura sem proveniência explícita (fix direto do sensor)', () => {
    expect(persistableAssetGps({ lat: -16.68, lng: -49.25 })).toEqual({ lat: -16.68, lng: -49.25 });
  });

  it('recusa ausência de leitura, coordenada zero e NaN', () => {
    expect(persistableAssetGps(null)).toBeNull();
    expect(persistableAssetGps(undefined)).toBeNull();
    expect(persistableAssetGps({ lat: 0, lng: 0 })).toBeNull();
    expect(persistableAssetGps({ lat: Number.NaN, lng: -47.88 })).toBeNull();
    expect(persistableAssetGps({ lat: -15.79, lng: 999 })).toBeNull();
  });
});

describe('shouldAttemptAssetGpsCapture — quem pode tentar a leitura', () => {
  it('admin/master não é motivo para dispensar a captura', () => {
    expect(shouldAttemptAssetGpsCapture({ bypassed: false, battery: 80 })).toBe(true);
  });

  it('bypass explícito (gbr_gps_bypass) dispensa a captura', () => {
    expect(shouldAttemptAssetGpsCapture({ bypassed: true, battery: 80 })).toBe(false);
  });

  it('bateria crítica ou desconhecida dispensa a captura', () => {
    expect(shouldAttemptAssetGpsCapture({ bypassed: false, battery: 5 })).toBe(false);
    expect(shouldAttemptAssetGpsCapture({ bypassed: false, battery: undefined })).toBe(false);
  });
});

describe('getCurrentLocation sem sensor disponível', () => {
  it('não devolve a âncora como posição: nada é persistível no ativo', async () => {
    const loc = await getCurrentLocation(true);
    expect(persistableAssetGps(loc)).toBeNull();
  });
});
