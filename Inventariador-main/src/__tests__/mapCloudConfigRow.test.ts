// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mapCloudConfigRow, buildConfigCloudPayload } from '../services/supabaseService';

/**
 * O pull da nuvem entrega a configuração ao estado do inventário. Os campos de
 * identidade da LINHA (`id`, `tenantid`) não podem entrar no estado: qualquer
 * gravador que fizesse spread os copiava de volta para o payload e a config
 * voltava para a linha de origem (`global_config`) em vez de `config_<TENANT>`.
 */
describe('mapCloudConfigRow — a identidade da linha não entra no estado', () => {
  it('descarta id e tenantid, mantendo o resto da configuração', () => {
    const mapped = mapCloudConfigRow({
      id: 'global_config',
      tenantid: 'default',
      last_updated: '2026-11-12T02:59:07.536Z',
      status: 'IN_USE',
      companies: ['010101 CICOPAL GO'],
      dark_mode: true
    });

    expect('id' in mapped).toBe(false);
    expect('tenantid' in mapped).toBe(false);
    expect('tenantId' in mapped).toBe(false);
    expect(mapped.lastUpdated).toBe('2026-11-12T02:59:07.536Z');
    expect(mapped.companies).toEqual(['010101 CICOPAL GO']);
    expect(mapped.darkMode).toBe(true);
  });

  it('descarta também o tenantId em camelCase (estado antigo reintroduzido)', () => {
    const mapped = mapCloudConfigRow({ tenantId: 'default', status: 'IN_USE' });

    expect('tenantId' in mapped).toBe(false);
    expect(mapped.status).toBe('IN_USE');
  });

  it('a config do pull, ao subir com o tenant do contrato, vai para config_<TENANT>', () => {
    // Antes o estado carregava id='global_config'/tenantid='default' e a gravação
    // repetia o erro; agora o estado não tem identidade e o destino é o contrato.
    const stateConfig = mapCloudConfigRow({
      id: 'global_config',
      tenantid: 'default',
      last_updated: '2026-11-12T02:59:07.536Z',
      status: 'IN_USE'
    });

    const built = buildConfigCloudPayload(stateConfig, 'CICOPAL');

    expect(built?.configId).toBe('config_CICOPAL');
    expect(built?.payload.id).toBe('config_CICOPAL');
    expect(built?.payload.tenantid).toBe('CICOPAL');
  });

  it('linha nula ou vazia devolve objeto vazio', () => {
    expect(mapCloudConfigRow(null)).toEqual({});
    expect(mapCloudConfigRow(undefined)).toEqual({});
    expect(mapCloudConfigRow({})).toEqual({});
  });
});
