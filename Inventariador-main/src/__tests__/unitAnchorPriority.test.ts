import { describe, it, expect } from 'vitest';
import { resolveCanonicalUnitAnchor } from '../utils/unitAnchorPriority';
import { buildUnitConfigRowPayload } from '../utils/unitConfigPayload';
import type { UnitConfig } from '../types';

/**
 * `unit_configs` é a fonte canónica da âncora: a linha vence a que veio de
 * `inventory_config`, mas uma linha sem coordenada real nunca a apaga.
 */
describe('resolveCanonicalUnitAnchor', () => {
  it('a linha de unit_configs vence a âncora antiga de inventory_config', () => {
    const r = resolveCanonicalUnitAnchor(
      { lat: -15.7942, lng: -47.8825, radius_meters: 500 },
      { lat: -1.3555577, lng: -48.252235, radius_meters: 300 }
    );
    expect(r).toEqual({ lat: -1.3555577, lng: -48.252235, radius_meters: 300, source: 'unit_configs' });
  });

  it('sem âncora canónica usa a de inventory_config (compatibilidade)', () => {
    const r = resolveCanonicalUnitAnchor(
      { lat: -15.7942, lng: -47.8825, radius_meters: 500 },
      { lat: 0, lng: 0, radius_meters: 0 }
    );
    expect(r).toEqual({ lat: -15.7942, lng: -47.8825, radius_meters: 500, source: 'inventory_config' });
  });

  it('linha de unit_configs só com flags não apaga a âncora antiga', () => {
    const r = resolveCanonicalUnitAnchor(
      { lat: -16.68, lng: -49.25, radius_meters: 200 },
      { lat: null, lng: null, radius_meters: null }
    );
    expect(r?.source).toBe('inventory_config');
    expect(r?.lat).toBe(-16.68);
  });

  it('raio canónico manda; sem ele herda o da âncora antiga', () => {
    const semRaio = resolveCanonicalUnitAnchor(
      { lat: -15.7942, lng: -47.8825, radius_meters: 500 },
      { lat: -1.3555577, lng: -48.252235, radius_meters: 0 }
    );
    expect(semRaio?.radius_meters).toBe(500);

    const comRaio = resolveCanonicalUnitAnchor(
      { lat: -15.7942, lng: -47.8825, radius_meters: 500 },
      { lat: -1.3555577, lng: -48.252235, radius_meters: 120 }
    );
    expect(comRaio?.radius_meters).toBe(120);
  });

  it('sem âncora de nenhum dos lados devolve null', () => {
    expect(resolveCanonicalUnitAnchor(null, null)).toBeNull();
    expect(resolveCanonicalUnitAnchor({ lat: 0, lng: 0 }, undefined)).toBeNull();
    expect(resolveCanonicalUnitAnchor(undefined, { lat: NaN, lng: 2 })).toBeNull();
  });
});

describe('buildUnitConfigRowPayload', () => {
  const base = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA', unit_id: '010201 SNACKS PA' } as UnitConfig;

  it('grava a coordenada quando ela é real', () => {
    const payload = buildUnitConfigRowPayload(
      { ...base, lat: -1.3555577, lng: -48.252235, radius_meters: 500 } as UnitConfig,
      {},
      'CICOPAL',
      '010201 SNACKS PA'
    );
    expect(payload.lat).toBeCloseTo(-1.3555577, 6);
    expect(payload.lng).toBeCloseTo(-48.252235, 6);
    expect(payload.radius_meters).toBe(500);
  });

  it('não envia lat/lng numa gravação só de flags (não zera a âncora)', () => {
    const payload = buildUnitConfigRowPayload(
      { ...base, lat: 0, lng: 0 } as UnitConfig,
      {},
      'CICOPAL',
      '010201 SNACKS PA'
    );
    expect('lat' in payload).toBe(false);
    expect('lng' in payload).toBe(false);
    expect('radius_meters' in payload).toBe(false);
  });

  it('mantém as flags já guardadas na nuvem e aplica as novas', () => {
    const payload = buildUnitConfigRowPayload(
      { ...base, lat: -1.35, lng: -48.25, requireNf: true } as UnitConfig,
      { requireSeriado: true },
      'CICOPAL',
      '010201 SNACKS PA'
    );
    const flags = payload.flags as Record<string, unknown>;
    expect(flags.requireSeriado).toBe(true);
    expect(flags.requireNf).toBe(true);
  });
});
