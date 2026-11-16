// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { mapInventoryConfigRow } from '../services/supabaseService';

/**
 * A linha de `inventory_config` só vira config de filial quando tem filial E
 * coordenada utilizável. A linha global `config_<tenant>` (`filial` e `data`
 * nulos) e rascunhos sem lat/lng não podem zerar a âncora da unidade — era o
 * que deixava a filial em "FALTA ÂNCORA GPS" mesmo com a âncora gravada.
 */
describe('mapInventoryConfigRow — linha da nuvem só vira config se tiver âncora', () => {
  it('ignora a linha global de configuração (filial e data nulos)', () => {
    expect(mapInventoryConfigRow({ id: 'config_CICOPAL', tenantid: 'CICOPAL', filial: null, data: null }, 'CICOPAL')).toBeNull();
  });

  it('ignora linha com data sem coordenada ou com coordenada zero', () => {
    expect(mapInventoryConfigRow({ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', data: { filial: '010101 CICOPAL GO' } })).toBeNull();
    expect(
      mapInventoryConfigRow({ tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', data: { lat: 0, lng: 0 } })
    ).toBeNull();
  });

  it('não usa a filial da sessão como chave quando a linha não identifica a filial', () => {
    expect(mapInventoryConfigRow({ tenantid: 'CICOPAL', filial: null, data: { lat: -16.7, lng: -49.1 } })).toBeNull();
  });

  it('mapeia a âncora da filial com raio e flags do payload', () => {
    const cfg = mapInventoryConfigRow({
      tenantid: 'CICOPAL',
      filial: '010201 SNACKS PA',
      updated_at: '2026-11-12T00:58:58.469+00:00',
      data: {
        filial: '010201 SNACKS PA',
        lat: -1.3555577,
        lng: -48.252235,
        radius_meters: 500,
        is_active: true,
        source: 'manual',
        flags: { hasGps: true }
      }
    });
    expect(cfg).toMatchObject({
      filial: '010201 SNACKS PA',
      unit_id: '010201 SNACKS PA',
      tenantid: 'CICOPAL',
      radius_meters: 500,
      is_active: true,
      source: 'manual',
      flags: { hasGps: true }
    });
    expect(Number(cfg?.lat)).toBeCloseTo(-1.3555577);
    expect(Number(cfg?.lng)).toBeCloseTo(-48.252235);
  });

  it('aceita filial vinda apenas do data (linha legada sem coluna filial)', () => {
    const cfg = mapInventoryConfigRow(
      { tenantid: 'CICOPAL', data: { unit_id: '010105 CICOPAL PA', lat: -15.7, lng: -47.9 } },
      'CICOPAL'
    );
    expect(cfg?.filial).toBe('010105 CICOPAL PA');
  });

  it('usa o tenant de fallback quando o payload não traz tenantid', () => {
    const cfg = mapInventoryConfigRow({ filial: 'MATRIZ', data: { lat: -16.7, lng: -49.1 } }, 'CICOPAL');
    expect(cfg?.tenantid).toBe('CICOPAL');
  });
});
