// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { buildConfigCloudPayload } from '../services/supabaseService';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('buildConfigCloudPayload — a config do tenant vai para config_<TENANT>', () => {
  it('não deixa a linha de origem (global_config/default) sequestrar o id', () => {
    // A config que desce da nuvem via fallback traz id='global_config' e
    // tenantid='default'. Ao subir, esses campos faziam o app regravar sempre
    // na linha global — config_CICOPAL nunca nascia.
    const built = buildConfigCloudPayload(
      {
        id: 'global_config',
        tenantid: 'default',
        filial: null,
        data: { filial: 'MATRIZ' },
        created_at: '2026-11-08T19:10:02.291815+00:00',
        lastUpdated: '2026-11-12T02:59:07.536Z',
        status: 'IN_USE',
        companies: ['010101 CICOPAL GO']
      },
      'CICOPAL'
    );

    expect(built).not.toBeNull();
    expect(built?.configId).toBe('config_CICOPAL');
    expect(built?.payload.id).toBe('config_CICOPAL');
    expect(built?.payload.tenantid).toBe('CICOPAL');
    expect(built?.payload.last_updated).toBe('2026-11-12T02:59:07.536Z');
    expect(built?.payload.companies).toEqual(['010101 CICOPAL GO']);
  });

  it('usa o tenant desta sessão quando o chamador não passa tenant', () => {
    localStorage.setItem('tenantid', 'CICOPAL');

    const built = buildConfigCloudPayload({
      id: 'global_config',
      tenantid: 'default',
      status: 'IN_USE'
    });

    expect(built?.configId).toBe('config_CICOPAL');
    expect(built?.payload.tenantid).toBe('CICOPAL');
  });

  it('não envia colunas que não são da configuração nem batterySaver', () => {
    const built = buildConfigCloudPayload(
      {
        tenantid: 'CICOPAL',
        filial: '010101 CICOPAL GO',
        data: { lat: -16.7 },
        created_at: '2026-11-08T19:10:02Z',
        updated_at: '2026-11-12T02:59:07Z',
        metadata: {},
        batterySaver: true,
        darkMode: true
      },
      'CICOPAL'
    );

    expect(built).not.toBeNull();
    const keys = Object.keys(built?.payload || {});
    expect(keys).not.toContain('filial');
    expect(keys).not.toContain('data');
    expect(keys).not.toContain('created_at');
    expect(keys).not.toContain('updated_at');
    expect(keys).not.toContain('metadata');
    expect(keys).not.toContain('battery_saver');
    expect(built?.payload.dark_mode).toBe(true);
  });

  it('devolve null quando não há tenant em lado nenhum (não inventa destino)', () => {
    expect(buildConfigCloudPayload({ status: 'IN_USE', tenantid: 'undefined' })).toBeNull();
    expect(buildConfigCloudPayload({ status: 'IN_USE', tenantid: 'null' })).toBeNull();
    expect(buildConfigCloudPayload({ status: 'IN_USE' })).toBeNull();
  });

  it('trata `default` como identidade inválida e nunca cria config_default', () => {
    // `default` é o tenant sentinela da linha global_config: não é um contrato.
    expect(buildConfigCloudPayload({ status: 'IN_USE', tenantid: 'default' })).toBeNull();
    expect(buildConfigCloudPayload({ status: 'IN_USE', tenantid: 'DEFAULT' })).toBeNull();
    expect(buildConfigCloudPayload({ status: 'IN_USE', tenantid: ' Default ' })).toBeNull();
    expect(buildConfigCloudPayload({ status: 'IN_USE' }, 'default')).toBeNull();
  });

  it('prefere o tenant da própria config ao contrato antigo guardado no aparelho', () => {
    // Contrato antigo no localStorage não pode receber a config de outro contrato.
    localStorage.setItem('tenantid', 'CONTRATO_ANTIGO');

    const built = buildConfigCloudPayload(
      { tenantid: 'CICOPAL', status: 'IN_USE' },
      undefined
    );

    expect(built?.configId).toBe('config_CICOPAL');
    expect(built?.payload.tenantid).toBe('CICOPAL');
  });

  it('salta o candidato inválido e usa o próximo válido', () => {
    localStorage.setItem('tenantid', 'default');

    const built = buildConfigCloudPayload({ tenantid: 'CICOPAL', status: 'IN_USE' });

    expect(built?.configId).toBe('config_CICOPAL');
    expect(built?.payload.tenantid).toBe('CICOPAL');
  });
});
