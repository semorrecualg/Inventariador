// ============================================================================
// campaignGuard.test.ts — a campanha é a chave de controlo da filial (Fase 1).
//
// Regras fixadas:
//   • campanha sem filial é "Negativo!" (CREATED e ACTIVE contam como abertas);
//   • só uma campanha aberta por filial — criar e ATIVAR passam pela mesma
//     guarda, e a própria campanha nunca bloqueia a sua reativação;
//   • campanha com trabalho de auditoria não pode ser excluída.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { CampaignStatus, type InventoryCampaign } from '../types';
import {
  CampaignGovernanceError,
  assertCampaignHasNoAuditWork,
  assertNoOpenCampaign,
  campaignFilialKey,
  findOpenCampaignForFilial,
  isOpenCampaign,
  requireCampaignFilial
} from '../utils/campaignGuard';

const FILIAL = '010101 CICOPAL GO';

const campanha = (over: Partial<InventoryCampaign> = {}): InventoryCampaign => ({
  id: 'camp-1',
  name: 'Inventário nov 2026',
  status: CampaignStatus.ACTIVE,
  tenantid: 'CICOPAL',
  filial: FILIAL,
  created_by: 'master@cicopal.com',
  created_at: '2026-11-17T10:00:00.000Z',
  start_date: '2026-11-17T10:00:00.000Z',
  ...over
});

const erro = (fn: () => unknown): CampaignGovernanceError => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(CampaignGovernanceError);
    return err as CampaignGovernanceError;
  }
  throw new Error('esperava um CampaignGovernanceError');
};

describe('requireCampaignFilial', () => {
  it('aceita a filial real e devolve-a aparada', () => {
    expect(requireCampaignFilial(`  ${FILIAL}  `)).toBe(FILIAL);
  });

  it.each(['', '   ', 'TODAS', 'NULL', 'undefined', 'N/A'])('recusa a filial vazia ou sentinela (%s)', (valor) => {
    const err = erro(() => requireCampaignFilial(valor));
    expect(err.code).toBe('FILIAL_OBRIGATORIA');
    expect(err.message.startsWith('Negativo!')).toBe(true);
  });
});

describe('campanha aberta', () => {
  it('CREATED e ACTIVE são abertas; CLOSED e ARCHIVED não', () => {
    expect(isOpenCampaign(campanha({ status: CampaignStatus.CREATED }))).toBe(true);
    expect(isOpenCampaign(campanha({ status: CampaignStatus.ACTIVE }))).toBe(true);
    expect(isOpenCampaign(campanha({ status: CampaignStatus.CLOSED }))).toBe(false);
    expect(isOpenCampaign(campanha({ status: CampaignStatus.ARCHIVED }))).toBe(false);
  });

  it('compara a filial por chave normalizada e aceita a coluna legada unit_id', () => {
    expect(campaignFilialKey(campanha({ filial: ` ${FILIAL.toLowerCase()} ` }))).toBe(FILIAL);
    expect(campaignFilialKey({ filial: undefined, unit_id: FILIAL } as InventoryCampaign)).toBe(FILIAL);
  });

  it('encontra a campanha aberta da filial e ignora a própria', () => {
    const lista = [campanha({ id: 'camp-1' }), campanha({ id: 'camp-2', status: CampaignStatus.CLOSED })];
    expect(findOpenCampaignForFilial(lista, FILIAL)?.id).toBe('camp-1');
    expect(findOpenCampaignForFilial(lista, FILIAL, { excludeId: 'camp-1' })).toBeUndefined();
  });

  it('não cruza contratos diferentes', () => {
    const lista = [campanha({ id: 'outro', tenantid: 'CLIENTETESTE' })];
    expect(findOpenCampaignForFilial(lista, FILIAL, { tenantid: 'CICOPAL' })).toBeUndefined();
    expect(findOpenCampaignForFilial(lista, FILIAL, { tenantid: 'CLIENTETESTE' })?.id).toBe('outro');
  });
});

describe('assertNoOpenCampaign', () => {
  it('bloqueia a criação quando a filial já tem campanha aberta', () => {
    const err = erro(() =>
      assertNoOpenCampaign([campanha({ name: 'Primeira' })], { tenantid: 'CICOPAL', filial: FILIAL })
    );
    expect(err.code).toBe('CAMPANHA_ABERTA');
    expect(err.message).toContain('Primeira');
  });

  it('deixa criar quando a campanha existente está encerrada ou arquivada', () => {
    expect(() =>
      assertNoOpenCampaign(
        [
          campanha({ id: 'a', status: CampaignStatus.CLOSED }),
          campanha({ id: 'b', status: CampaignStatus.ARCHIVED })
        ],
        { tenantid: 'CICOPAL', filial: FILIAL }
      )
    ).not.toThrow();
  });

  it('deixa criar noutra filial do mesmo contrato', () => {
    expect(() =>
      assertNoOpenCampaign([campanha()], { tenantid: 'CICOPAL', filial: '010105 CICOPAL PA' })
    ).not.toThrow();
  });
});

describe('assertCampaignHasNoAuditWork', () => {
  it('bloqueia a exclusão quando há ativos lidos na campanha', () => {
    const err = erro(() => assertCampaignHasNoAuditWork(3));
    expect(err.code).toBe('TRABALHO_DE_AUDITORIA');
  });

  it('permite excluir campanha sem trabalho de auditoria', () => {
    expect(() => assertCampaignHasNoAuditWork(0)).not.toThrow();
  });
});
