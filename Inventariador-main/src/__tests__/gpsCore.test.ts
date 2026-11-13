import { describe, it, expect } from 'vitest';
import {
  GPS_ACCURACY,
  GpsJitterFilter,
  isValidCoordinate,
  isPreciseFix,
  toGpsFix,
  distanceMeters,
} from '../utils/gpsCore';

const CURITIBA = { lat: -25.4284, lng: -49.2733 };

describe('gpsCore — isValidCoordinate', () => {
  it('aceita coordenada real', () => {
    expect(isValidCoordinate(CURITIBA.lat, CURITIBA.lng)).toBe(true);
    expect(isValidCoordinate('-16.7', '-49.1')).toBe(true);
  });

  it('rejeita (0,0): null disfarçado de sensor', () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
  });

  it('rejeita fora de faixa, NaN e não numérico', () => {
    expect(isValidCoordinate(91, 10)).toBe(false);
    expect(isValidCoordinate(10, 181)).toBe(false);
    expect(isValidCoordinate(NaN, 10)).toBe(false);
    expect(isValidCoordinate(null, null)).toBe(false);
    expect(isValidCoordinate('abc', '-49.1')).toBe(false);
  });
});

describe('gpsCore — precisão e qualidade', () => {
  it('só considera precisa dentro do limite pedido', () => {
    expect(isPreciseFix({ accuracy: 10 }, 30)).toBe(true);
    expect(isPreciseFix({ accuracy: 40 }, 30)).toBe(false);
    expect(isPreciseFix({ accuracy: 40 }, GPS_ACCURACY.COLLECT)).toBe(true);
    expect(isPreciseFix({ accuracy: 0 }, GPS_ACCURACY.COLLECT)).toBe(false);
    expect(isPreciseFix({ accuracy: Number.NaN }, GPS_ACCURACY.COLLECT)).toBe(false);
    expect(isPreciseFix(null)).toBe(false);
  });
});

describe('gpsCore — toGpsFix', () => {
  it('converte coords do sensor', () => {
    const fix = toGpsFix({ latitude: CURITIBA.lat, longitude: CURITIBA.lng, accuracy: 8 }, 1000);
    expect(fix).toMatchObject({ lat: CURITIBA.lat, lng: CURITIBA.lng, accuracy: 8, source: 'sensor', at: 1000 });
  });

  it('devolve null quando a leitura é inválida ou sem precisão', () => {
    expect(toGpsFix({ latitude: 0, longitude: 0, accuracy: 5 })).toBeNull();
    expect(toGpsFix({ latitude: CURITIBA.lat, longitude: CURITIBA.lng })).toBeNull();
    expect(toGpsFix(null)).toBeNull();
  });
});

describe('gpsCore — GpsJitterFilter', () => {
  it('rejeita leitura sintética (nunca vira posição de ativo)', () => {
    const filter = new GpsJitterFilter();
    expect(filter.accept({ ...CURITIBA, accuracy: 5, source: 'synthetic', at: 0 })).toBe(false);
    expect(filter.lastAccepted).toBeNull();
  });

  it('aceita o primeiro fix preciso e descarta oscilação parado', () => {
    const filter = new GpsJitterFilter();
    const t0 = 1_000_000;
    expect(filter.accept({ ...CURITIBA, accuracy: 8, source: 'sensor', at: t0 }, t0)).toBe(true);

    // 2 metros de oscilação 5s depois: ruído de sensor parado.
    expect(filter.accept({ lat: CURITIBA.lat + 0.00002, lng: CURITIBA.lng, accuracy: 8, source: 'sensor', at: t0 }, t0 + 5000)).toBe(false);
  });

  it('descarta precisão acima do limite', () => {
    const filter = new GpsJitterFilter({ maxAccuracyM: 30 });
    expect(filter.accept({ ...CURITIBA, accuracy: 90, source: 'sensor', at: 0 }, 0)).toBe(false);
  });

  it('descarta salto impossível (ruído de rede celular)', () => {
    const filter = new GpsJitterFilter();
    const t0 = 2_000_000;
    expect(filter.accept({ ...CURITIBA, accuracy: 10, source: 'sensor', at: t0 }, t0)).toBe(true);
    // ~11 km em 30s => 366 m/s, fisicamente impossível para auditoria.
    expect(filter.accept({ lat: CURITIBA.lat + 0.1, lng: CURITIBA.lng, accuracy: 10, source: 'sensor', at: t0 }, t0 + 30_000)).toBe(false);
  });

  it('aceita deslocamento real depois do intervalo mínimo', () => {
    const filter = new GpsJitterFilter();
    const t0 = 3_000_000;
    expect(filter.accept({ ...CURITIBA, accuracy: 10, source: 'sensor', at: t0 }, t0)).toBe(true);
    // ~111 m ao norte em 120s => 0,9 m/s, caminhada normal.
    expect(filter.accept({ lat: CURITIBA.lat + 0.001, lng: CURITIBA.lng, accuracy: 10, source: 'sensor', at: t0 }, t0 + 120_000)).toBe(true);
  });
});

describe('gpsCore — distância', () => {
  it('calcula distância entre pontos', () => {
    const d = distanceMeters(CURITIBA, { lat: CURITIBA.lat + 0.001, lng: CURITIBA.lng });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(125);
  });
});
