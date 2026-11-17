// ============================================================================
// campaignGuard.ts — a campanha é a CHAVE DE CONTROLO do inventário.
//
// Regras (Fase 1):
//   1. Campanha exige filial. Sem filial é "Negativo!".
//   2. Só pode existir UMA campanha aberta por filial. `CREATED` também conta:
//      uma campanha criada e ainda não ativada já reserva a filial, senão dois
//      auditores abriam duas campanhas para a mesma unidade.
//   3. Campanha com trabalho de auditoria (ativo conferido dentro dela) não
//      pode ser excluída — o laudo deixaria de ter lastro.
//
// As funções são puras para poderem ser testadas sem Dexie nem Supabase; a
// leitura das campanhas e a contagem de trabalho ficam nos serviços.
// ============================================================================
import { CampaignStatus, type InventoryCampaign } from '../types';

export type CampaignBlockCode =
  | 'FILIAL_OBRIGATORIA'
  | 'CAMPANHA_ABERTA'
  | 'TRABALHO_DE_AUDITORIA';

export class CampaignGovernanceError extends Error {
  readonly code: CampaignBlockCode;

  constructor(code: CampaignBlockCode, message: string) {
    super(message);
    this.name = 'CampaignGovernanceError';
    this.code = code;
  }
}

/** Filial canónica de comparação: aparada e em maiúsculas, como as chaves do inventário. */
export const campaignFilialKey = (campaign: Partial<InventoryCampaign> | null | undefined): string =>
  String(campaign?.filial || campaign?.unit_id || campaign?._unitid || '').trim().toUpperCase();

export const campaignTenantKey = (tenantid: unknown): string => String(tenantid ?? '').trim().toUpperCase();

/** Valores que a UI usa como "sem filial" e que nunca identificam uma unidade real. */
const EMPTY_UNIT_VALUES = new Set(['', 'TODAS', 'NULL', 'UNDEFINED', 'N/A', 'NA']);

/**
 * Devolve a filial aparada ou lança `FILIAL_OBRIGATORIA` — a campanha é o
 * contrato de trabalho do auditor em campo e sem filial não delimita nada.
 */
export function requireCampaignFilial(filial: unknown): string {
  const value = String(filial ?? '').trim();
  if (EMPTY_UNIT_VALUES.has(value.toUpperCase())) {
    throw new CampaignGovernanceError(
      'FILIAL_OBRIGATORIA',
      'Negativo! Campanha exige filial. Selecione a unidade operacional antes de criar a campanha.'
    );
  }
  return value;
}

export const isOpenCampaign = (campaign: Partial<InventoryCampaign> | null | undefined): boolean =>
  campaign?.status === CampaignStatus.CREATED || campaign?.status === CampaignStatus.ACTIVE;

/**
 * Procura a campanha aberta (CREATED ou ACTIVE) da filial — ignora a própria
 * campanha quando `excludeId` é passado (reativação da mesma campanha).
 *
 * O contrato é comparado por IGUALDADE, nunca por ausência: filiais homónimas
 * existem em contratos diferentes, e uma campanha gravada sem `tenantid`
 * (registo legado/anterior à coluna) é "sem dono" — não pode bloquear a
 * campanha de um contrato nomeado. O contrário também vale: criar sem contrato
 * só colide com campanhas igualmente sem contrato.
 */
export function findOpenCampaignForFilial(
  campaigns: InventoryCampaign[],
  filial: string,
  options: { excludeId?: string; tenantid?: string } = {}
): InventoryCampaign | undefined {
  const alvo = campaignFilialKey({ filial });
  if (!alvo) return undefined;
  // Sem contrato informado a procura é global (compatibilidade); com contrato
  // informado — mesmo que vazio — a comparação é por igualdade estrita.
  const scoped = options.tenantid !== undefined;
  const tenant = campaignTenantKey(options.tenantid);

  return campaigns.find((campaign) => {
    if (!isOpenCampaign(campaign)) return false;
    if (options.excludeId && String(campaign.id) === String(options.excludeId)) return false;
    if (campaignFilialKey(campaign) !== alvo) return false;
    if (scoped && campaignTenantKey(campaign.tenantid) !== tenant) return false;
    return true;
  });
}

/** Lança `CAMPANHA_ABERTA` quando a filial já tem uma campanha aberta. */
export function assertNoOpenCampaign(
  campaigns: InventoryCampaign[],
  params: { filial: string; tenantid?: string; excludeId?: string }
): void {
  const aberta = findOpenCampaignForFilial(campaigns, params.filial, {
    tenantid: params.tenantid,
    excludeId: params.excludeId
  });
  if (!aberta) return;

  const estado = aberta.status === CampaignStatus.CREATED ? 'criada (ainda não ativada)' : 'ativa';
  throw new CampaignGovernanceError(
    'CAMPANHA_ABERTA',
    `Negativo! A filial ${campaignFilialKey(aberta)} já tem a campanha "${aberta.name}" ${estado}. Encerre-a antes de abrir outra.`
  );
}

/** Lança `TRABALHO_DE_AUDITORIA` quando a campanha já tem ativos conferidos. */
export function assertCampaignHasNoAuditWork(workCount: number): void {
  if (workCount > 0) {
    throw new CampaignGovernanceError(
      'TRABALHO_DE_AUDITORIA',
      'Negativo! Esta campanha já tem trabalho de auditoria registado e não pode ser excluída. Encerre-a para preservar o laudo.'
    );
  }
}
