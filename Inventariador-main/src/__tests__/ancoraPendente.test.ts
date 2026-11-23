import { describe, it, expect } from 'vitest';
import {
  ANCORA_PENDENTE_KEY,
  contarAncorasPendentes,
  lerAncorasPendentes,
  registarAncoraPendente,
  removerAncoraPendente
} from '../utils/ancoraPendente';
import type { UnitConfig } from '../types';

/** Storage mínimo (sem jsdom) — a fila só usa getItem/setItem/removeItem. */
const makeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    }
  };
};

const ancora = (over: Partial<UnitConfig> = {}): UnitConfig => ({
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  unit_id: '010101 CICOPAL GO',
  lat: -16.706719,
  lng: -49.106422,
  radius_meters: 500,
  is_active: true,
  source: 'manual',
  updated_by: 'auditor@x',
  ...over
});

describe('fila de âncoras por subir', () => {
  it('registra a âncora com a config completa e o instante da falha', () => {
    const storage = makeStorage();
    const total = registarAncoraPendente(storage, ancora(), '2026-11-23T21:00:00.000Z');

    expect(total).toBe(1);
    const fila = lerAncorasPendentes(storage);
    expect(fila).toHaveLength(1);
    expect(fila[0].tenantid).toBe('CICOPAL');
    expect(fila[0].filial).toBe('010101 CICOPAL GO');
    expect(fila[0].saved_at).toBe('2026-11-23T21:00:00.000Z');
    expect(fila[0].config.lat).toBeCloseTo(-16.706719);
    expect(fila[0].config.radius_meters).toBe(500);
  });

  it('uma unidade pesa uma vez só e fica com a posição mais recente', () => {
    const storage = makeStorage();
    registarAncoraPendente(storage, ancora(), '2026-11-23T21:00:00.000Z');
    // Mesma filial com outra grafia (caixa/underscore) e outra posição.
    registarAncoraPendente(
      storage,
      ancora({ filial: '010101 cicopal go', unit_id: undefined, lat: -16.68, lng: -49.25 }),
      '2026-11-23T21:05:00.000Z'
    );

    const fila = lerAncorasPendentes(storage);
    expect(fila).toHaveLength(1);
    expect(fila[0].config.lat).toBeCloseTo(-16.68);
    expect(fila[0].saved_at).toBe('2026-11-23T21:05:00.000Z');
  });

  it('unidades diferentes convivem na mesma fila', () => {
    const storage = makeStorage();
    registarAncoraPendente(storage, ancora());
    registarAncoraPendente(
      storage,
      ancora({ filial: '010401 CARPER BA', unit_id: '010401 CARPER BA', lat: -12.9, lng: -38.5 })
    );
    expect(contarAncorasPendentes(storage)).toBe(2);
  });

  it('recusa coordenada zero/absurda e unidade vazia', () => {
    const storage = makeStorage();
    expect(registarAncoraPendente(storage, ancora({ lat: 0, lng: 0 }))).toBe(0);
    expect(registarAncoraPendente(storage, ancora({ lat: 500, lng: 999 }))).toBe(0);
    expect(registarAncoraPendente(storage, ancora({ filial: '', unit_id: undefined }))).toBe(0);
    expect(storage.getItem(ANCORA_PENDENTE_KEY)).toBeNull();
  });

  it('remover a unidade confirmada esvazia a chave', () => {
    const storage = makeStorage();
    registarAncoraPendente(storage, ancora());
    removerAncoraPendente(storage, 'CICOPAL', '010101 CICOPAL GO');
    expect(contarAncorasPendentes(storage)).toBe(0);
    expect(storage.getItem(ANCORA_PENDENTE_KEY)).toBeNull();
  });

  it('JSON quebrado ou lixo não derruba a leitura', () => {
    const storage = makeStorage({ [ANCORA_PENDENTE_KEY]: '{not-json' });
    expect(() => lerAncorasPendentes(storage)).not.toThrow();
    expect(lerAncorasPendentes(storage)).toEqual([]);

    storage.setItem(
      ANCORA_PENDENTE_KEY,
      JSON.stringify([
        { tenantid: 'CICOPAL', filial: 'SEM COORDENADA', config: { lat: null, lng: null } },
        { tenantid: '', filial: 'SEM TENANT', config: { lat: -16.7, lng: -49.1 } },
        'lixo',
        { tenantid: 'CICOPAL', filial: 'OK', config: { filial: 'OK', lat: -16.7, lng: -49.1 } }
      ])
    );

    const fila = lerAncorasPendentes(storage);
    expect(fila).toHaveLength(1);
    expect(fila[0].filial).toBe('OK');
  });
});
