// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { REVOKED_ANCHORS, isRevokedAnchor, normalizeRevokedUnit } from '../utils/revokedAnchors';
import { saveUnitConfig } from '../services/supabaseService';

/**
 * Âncoras apagadas na nuvem em 2026-11-16 (`MATRIZ` e `010101 CICOPAL GO`).
 * O aparelho não pode reintroduzi-las a partir do cache no próximo salvamento.
 */
describe('isRevokedAnchor', () => {
  it('recusa a combinação unidade + coordenada revogada', () => {
    REVOKED_ANCHORS.forEach(r => {
      expect(isRevokedAnchor(r.unit, r.lat, r.lng)).toBe(true);
    });
  });

  it('aceita a mesma unidade numa posição nova', () => {
    expect(isRevokedAnchor('010101 CICOPAL GO', -16.68, -49.25)).toBe(false);
    expect(isRevokedAnchor('MATRIZ', -16.68, -49.25)).toBe(false);
  });

  it('não confunde coordenada igual de outra unidade', () => {
    expect(isRevokedAnchor('010201 SNACKS PA', -15.7942, -47.8825)).toBe(false);
  });

  it('tolera chaves com underscore/maiúsculas e coordenadas em texto', () => {
    expect(isRevokedAnchor('010101_CICOPAL_GO', '-15.7942', '-47.8825')).toBe(true);
    expect(normalizeRevokedUnit('010101_cicopal_go')).toBe('010101 CICOPAL GO');
  });

  it('não recusa unidade vazia nem coordenada inválida', () => {
    expect(isRevokedAnchor('', -15.7942, -47.8825)).toBe(false);
    expect(isRevokedAnchor('MATRIZ', null, null)).toBe(false);
    expect(isRevokedAnchor(undefined, undefined, undefined)).toBe(false);
  });
});

describe('saveUnitConfig com âncora revogada', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
  });

  it('recusa gravar a coordenada revogada e explica porquê', async () => {
    const res = await saveUnitConfig({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      unit_id: '010101 CICOPAL GO',
      lat: -15.7942,
      lng: -47.8825,
      radius_meters: 500,
      is_active: true
    } as never);
    expect(typeof res).toBe('string');
    expect(String(res)).toContain('REVOGADA');
    // Nada foi gravado no cache do aparelho.
    expect(localStorage.getItem('local_unit_configs')).toBeNull();
    expect(localStorage.getItem('kardek_gps_ancora_010101 CICOPAL GO')).toBeNull();
  });

  it('grava normalmente uma posição nova da mesma unidade', async () => {
    const res = await saveUnitConfig({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      unit_id: '010101 CICOPAL GO',
      lat: -16.68,
      lng: -49.25,
      radius_meters: 500,
      is_active: true
    } as never);
    expect(res).not.toEqual(expect.stringContaining('REVOGADA'));
    const cache = JSON.parse(localStorage.getItem('local_unit_configs') || '{}');
    expect(Object.values(cache).some((c) => (c as { filial?: string }).filial === '010101 CICOPAL GO')).toBe(true);
  });
});
