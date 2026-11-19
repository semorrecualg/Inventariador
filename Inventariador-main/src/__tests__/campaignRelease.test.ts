// @vitest-environment jsdom
// ============================================================================
// campaignRelease.test.ts — merge por `id` e tolerância a falhas das fontes.
//
// Regressão real: `mergeRows` prefixava a chave com a fonte (`local-<id>` /
// `scoped-<id>`), portanto a MESMA campanha vinda do banco local e da nuvem
// entrava duas vezes — o comentário prometia dedupe por id e não havia nenhum.
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import {
  loadCampaignUnitsForRelease,
  mergeCampaignRows,
  type CampaignReleaseRow
} from '../utils/campaignRelease';
import { isUnitInReleaseSet } from '../utils/unitRelease';

const TENANT = 'CICOPAL';
const CARD_FILIAL = '010101 CICOPAL GO';
const CLOUD_FILIAL = '010101_CICOPAL_GO';

describe('mergeCampaignRows — dedupe por id', () => {
  it('a mesma campanha nas duas fontes é UMA linha, e a nuvem vence', () => {
    const rows = mergeCampaignRows(
      [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'CREATED' }],
      [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'ACTIVE' }]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ACTIVE');
  });

  it('ids diferentes das duas fontes sobrevivem os dois', () => {
    const rows = mergeCampaignRows(
      [{ id: 'camp-local', filial: CLOUD_FILIAL, status: 'CREATED' }],
      [{ id: 'camp-cloud', filial: '010201_SNACKS_PA', status: 'ACTIVE' }]
    );

    expect(rows.map((r) => r.id).sort()).toEqual(['camp-cloud', 'camp-local']);
  });

  it('linhas sem id não colidem entre si nem com uma linha identificada', () => {
    const rows = mergeCampaignRows(
      [{ filial: 'SEM ID LOCAL' }],
      [{ filial: 'SEM ID NUVEM' }, { id: 'camp-1', filial: CLOUD_FILIAL }]
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => String(r.filial)).sort()).toEqual([
      '010101_CICOPAL_GO',
      'SEM ID LOCAL',
      'SEM ID NUVEM'
    ]);
  });

  it('id numérico e id em caixa diferente são a MESMA campanha (comparação textual)', () => {
    const rows = mergeCampaignRows(
      [{ id: 42, filial: CLOUD_FILIAL, status: 'CREATED' }],
      [{ id: '42', filial: CLOUD_FILIAL, status: 'CREATED' }]
    );

    expect(rows).toHaveLength(1);
  });
});

describe('loadCampaignUnitsForRelease — fontes', () => {
  it('campanha que só existe na nuvem liberta a unidade do cartão', async () => {
    const units = await loadCampaignUnitsForRelease({
      scope: `  ${TENANT}  `,
      readLocal: async () => [],
      fetchScoped: async (tenant) => {
        expect(tenant).toBe(TENANT); // contrato vem trimado, sem espaços
        return [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'ACTIVE' }];
      }
    });

    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(true);
    expect(isUnitInReleaseSet(units.recorded, CARD_FILIAL)).toBe(true);
  });

  it('a mesma campanha no local (CREATED) e na nuvem (ACTIVE) conta uma vez e fica ativa', async () => {
    const units = await loadCampaignUnitsForRelease({
      scope: TENANT,
      readLocal: async (): Promise<CampaignReleaseRow[]> => [
        { id: 'camp-1', filial: CLOUD_FILIAL, status: 'CREATED' }
      ],
      fetchScoped: async () => [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'ACTIVE' }]
    });

    expect(units.active.size).toBe(1);
    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(true);
  });

  it('sem contrato resolvido (dono global) não chama a fonte remota', async () => {
    const fetchScoped = vi.fn(async () => [{ id: 'camp-x', filial: CLOUD_FILIAL, status: 'ACTIVE' }]);

    const units = await loadCampaignUnitsForRelease({
      scope: '   ',
      readLocal: async () => [{ filial: CLOUD_FILIAL, status: 'ACTIVE' }],
      fetchScoped
    });

    expect(fetchScoped).not.toHaveBeenCalled();
    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(true);
  });

  it('falha da fonte remota não apaga a campanha local', async () => {
    const units = await loadCampaignUnitsForRelease({
      scope: TENANT,
      readLocal: async () => [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'ACTIVE' }],
      fetchScoped: async () => {
        throw new Error('rede em baixo');
      }
    });

    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(true);
  });

  it('falha da leitura local ainda deixa valer a campanha da nuvem', async () => {
    const units = await loadCampaignUnitsForRelease({
      scope: TENANT,
      readLocal: async () => {
        throw new Error('dexie indisponível');
      },
      fetchScoped: async () => [{ id: 'camp-1', filial: CLOUD_FILIAL, status: 'ACTIVE' }]
    });

    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(true);
  });

  it('campanha de outro contrato não liberta (o escopo remoto é do contrato)', async () => {
    const units = await loadCampaignUnitsForRelease({
      scope: TENANT,
      readLocal: async () => [],
      fetchScoped: async () => []
    });

    expect(units.active.size).toBe(0);
    expect(isUnitInReleaseSet(units.active, CARD_FILIAL)).toBe(false);
  });
});
