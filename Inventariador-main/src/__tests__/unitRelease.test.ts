// src/__tests__/unitRelease.test.ts
// Liberação da UNIDADE OPERACIONAL: o admin/master configura âncora GPS e
// campanha; só com as duas a unidade fica liberada para o inventário de campo.
// Estes testes fixam a regra única usada pelo contrato de trabalho (/contexto)
// e pela entrada do módulo.
import { describe, it, expect } from 'vitest';
import {
  ACTIVE_CAMPAIGN_CACHE_PREFIX,
  buildUnitReleaseMap,
  campaignUnitOf,
  collectActiveCampaignUnits,
  describeUnitReleaseMissing,
  isActiveCampaign,
  isUnitInReleaseSet,
  readActiveCampaignCache,
  readUnitRelease,
  resolveUnitReleaseStatus,
  unitReleaseKey
} from '../utils/unitRelease';

describe('unitRelease · regra âncora + campanha', () => {
  it('libera somente com âncora E campanha configuradas', () => {
    expect(resolveUnitReleaseStatus({ hasAnchor: true, hasCampaign: true })).toEqual({
      hasAnchor: true,
      hasCampaign: true,
      released: true,
      missing: []
    });
  });

  it('aponta o que falta quando só uma das configurações existe', () => {
    expect(resolveUnitReleaseStatus({ hasAnchor: true, hasCampaign: false })).toMatchObject({
      released: false,
      missing: ['CAMPAIGN']
    });
    expect(resolveUnitReleaseStatus({ hasAnchor: false, hasCampaign: true })).toMatchObject({
      released: false,
      missing: ['ANCHOR']
    });
  });

  it('unidade sem nenhuma configuração fica pendente das duas', () => {
    // É o caso da tela UNIDADE OPERACIONAL: DADOS ativo, âncora e campanha
    // desligados → a unidade NÃO está liberada.
    expect(resolveUnitReleaseStatus({})).toEqual({
      hasAnchor: false,
      hasCampaign: false,
      released: false,
      missing: ['ANCHOR', 'CAMPAIGN']
    });
    expect(resolveUnitReleaseStatus(null).released).toBe(false);
  });
});

describe('unitRelease · mapa por contrato + filial', () => {
  it('usa chave composta (mesma filial em contratos diferentes não se mistura)', () => {
    expect(unitReleaseKey('cicopal', '010101_cicopal_go')).toBe('CICOPAL::010101 CICOPAL GO');
    expect(unitReleaseKey('outro', '010101_cicopal_go')).not.toBe(unitReleaseKey('cicopal', '010101_cicopal_go'));
    expect(unitReleaseKey('cicopal', '')).toBe('');
  });

  it('monta o mapa com as flags da base e normaliza o nome da filial', () => {
    const map = buildUnitReleaseMap([
      { name: '010101_CICOPAL_GO', tenantid: 'cicopal', hasAnchor: true, hasCampaign: false },
      { name: '020202 CICOPAL RJ', tenantid: 'cicopal', hasAnchor: true, hasCampaign: true }
    ]);

    expect(map['CICOPAL::010101 CICOPAL GO'].released).toBe(false);
    expect(map['CICOPAL::010101 CICOPAL GO'].missing).toEqual(['CAMPAIGN']);
    expect(readUnitRelease(map, 'CICOPAL', '010101 CICOPAL GO')?.released).toBe(false);
    expect(readUnitRelease(map, 'cicopal', '020202_cicopal_rj')?.released).toBe(true);
  });

  it('soma registros repetidos da mesma unidade', () => {
    const map = buildUnitReleaseMap([
      { name: 'MATRIZ', tenantid: 'T1', hasAnchor: true, hasCampaign: false },
      { name: 'MATRIZ', tenantid: 'T1', hasAnchor: false, hasCampaign: true }
    ]);
    expect(map['T1::MATRIZ'].released).toBe(true);
  });

  it('unidade desconhecida não é tratada como bloqueada', () => {
    const map = buildUnitReleaseMap([{ name: 'OUTRA', tenantid: 'T1', hasAnchor: false, hasCampaign: false }]);
    expect(readUnitRelease(map, 'T1', 'FILIAL NOVA')).toBeNull();
    expect(readUnitRelease(undefined, 'T1', 'FILIAL NOVA')).toBeNull();
  });

  it('descreve em português o que falta para liberar', () => {
    expect(describeUnitReleaseMissing(resolveUnitReleaseStatus({}))).toBe('âncora GPS e campanha');
    expect(describeUnitReleaseMissing(resolveUnitReleaseStatus({ hasAnchor: true }))).toBe('campanha');
    expect(describeUnitReleaseMissing(resolveUnitReleaseStatus({ hasAnchor: true, hasCampaign: true }))).toBe('');
  });
});

describe('unitRelease · campanha lida do banco persistido', () => {
  it('aceita os três nomes de campo da unidade', () => {
    expect(campaignUnitOf({ filial: '010101 CICOPAL GO' })).toBe('010101 CICOPAL GO');
    expect(campaignUnitOf({ unit_id: '010101_CICOPAL_GO' })).toBe('010101_CICOPAL_GO');
    expect(campaignUnitOf({ _unitid: '010101 CICOPAL GO' })).toBe('010101 CICOPAL GO');
    expect(campaignUnitOf({})).toBe('');
  });

  it('só ACTIVE libera a unidade', () => {
    expect(isActiveCampaign({ status: 'ACTIVE' })).toBe(true);
    expect(isActiveCampaign({ status: ' active ' })).toBe(true);
    expect(isActiveCampaign({ status: 'CREATED' })).toBe(false);
    expect(isActiveCampaign({ status: 'CLOSED' })).toBe(false);
    expect(isActiveCampaign({})).toBe(false);
  });

  it('reduz as campanhas ACTIVE ao conjunto de unidades', () => {
    const units = collectActiveCampaignUnits([
      { filial: '010101_CICOPAL_GO', status: 'ACTIVE' },
      { unit_id: '020202 CICOPAL RJ', status: 'CLOSED' },
      { status: 'ACTIVE' }
    ]);
    expect(Array.from(units)).toEqual(['010101 CICOPAL GO']);
  });

  it('encontra a unidade mesmo com grafia diferente', () => {
    const units = collectActiveCampaignUnits([{ filial: '010101_CICOPAL_GO', status: 'ACTIVE' }]);
    expect(isUnitInReleaseSet(units, '010101 CICOPAL GO')).toBe(true);
    expect(isUnitInReleaseSet(units, '010101')).toBe(true);
    expect(isUnitInReleaseSet(units, '020202 CICOPAL RJ')).toBe(false);
    expect(isUnitInReleaseSet(new Set(), '010101 CICOPAL GO')).toBe(false);
  });

  it('lê o cache local de activação gravado por qualquer ecrã', () => {
    const store = new Map<string, string>([
      [`${ACTIVE_CAMPAIGN_CACHE_PREFIX}010101_CICOPAL_GO`, 'true'],
      [`${ACTIVE_CAMPAIGN_CACHE_PREFIX}020202 CICOPAL RJ`, 'false'],
      ['outra_chave', 'true']
    ]);
    const storage = {
      get length() { return store.size; },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => store.get(k) ?? null
    };
    const units = readActiveCampaignCache(storage);
    expect(Array.from(units)).toEqual(['010101 CICOPAL GO']);
    expect(readActiveCampaignCache(null).size).toBe(0);
  });
});
