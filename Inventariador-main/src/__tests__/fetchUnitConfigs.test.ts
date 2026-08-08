// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { fetchUnitConfigs } from '../services/supabaseService';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('fetchUnitConfigs — merge local + fallback de tenant + âncoras de storage', () => {
  it('retorna as configs do local_unit_configs para o tenant pedido', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    localStorage.setItem(
      'local_unit_configs',
      JSON.stringify({
        CICOPAL_010101_CICOPAL_GO: {
          tenantid: 'CICOPAL',
          filial: '010101 CICOPAL GO',
          unit_id: '010101 CICOPAL GO',
          lat: -16.706719,
          lng: -49.106422,
          radius_meters: 500,
          is_active: true
        }
      })
    );

    const res = await fetchUnitConfigs('CICOPAL');
    const found = res.find(c => c.filial === '010101 CICOPAL GO');
    expect(found).toBeTruthy();
    expect(Number(found?.lat)).toBeCloseTo(-16.706719);
  });

  it('aceita configs com tenant fallback CICOPAL quando o tenant pedido é CICOPAL/vazio', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    localStorage.setItem(
      'local_unit_configs',
      JSON.stringify({
        CICOPAL_010105_CICOPAL_PA: {
          tenantid: 'CICOPAL',
          filial: '010105 CICOPAL PA',
          lat: -15.7,
          lng: -47.9
        }
      })
    );

    const res = await fetchUnitConfigs('CICOPAL');
    expect(res.some(c => c.filial === '010105 CICOPAL PA')).toBe(true);
  });

  it('NÃO vaza configs de outro tenant quando o tenant pedido é CICOPAL', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    localStorage.setItem(
      'local_unit_configs',
      JSON.stringify({
        ACME_010301_FEIRA: {
          tenantid: 'ACME',
          filial: '010301 FEIRA BOA BA',
          lat: -12.9,
          lng: -38.5
        }
      })
    );

    const res = await fetchUnitConfigs('CICOPAL');
    expect(res.some(c => c.filial === '010301 FEIRA BOA BA')).toBe(false);
  });

  it('lê a âncora gravada pelo UnitConfigurator no localStorage (kardek_gps_ancora_*)', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    localStorage.setItem(
      'kardek_gps_ancora_010101 CICOPAL GO',
      JSON.stringify({ filial: '010101 CICOPAL GO', unit_id: '010101 CICOPAL GO', lat: -16.7, lng: -49.1 })
    );

    const res = await fetchUnitConfigs('CICOPAL');
    const found = res.find(c => c.filial === '010101 CICOPAL GO');
    expect(found).toBeTruthy();
    expect(Number(found?.lat)).toBeCloseTo(-16.7);
  });

  it('lê o par gps_lat_/gps_lng_ do sessionStorage', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    sessionStorage.setItem('gps_lat_010105 CICOPAL PA', '-15.7');
    sessionStorage.setItem('gps_lng_010105 CICOPAL PA', '-47.9');

    const res = await fetchUnitConfigs('CICOPAL');
    const found = res.find(c => c.filial === '010105 CICOPAL PA');
    expect(found).toBeTruthy();
    expect(Number(found?.lng)).toBeCloseTo(-47.9);
  });

  it('não quebra com storage vazio ou local_unit_configs malformado', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    localStorage.setItem('local_unit_configs', '{not-json');

    await expect(fetchUnitConfigs('CICOPAL')).resolves.toBeInstanceOf(Array);
  });
});
