// ============================================================================
// campaignRelease — campanhas que LIBERTAM a unidade no contrato de trabalho
// ----------------------------------------------------------------------------
// O mapa de liberação (`TENANTID::FILIAL` → âncora/campanha) não pode depender
// da lista `campaigns` do ecrã: ela é filtrada por unidade e só é recarregada em
// algumas telas. Também não pode depender só do banco local: uma campanha que
// existe APENAS na nuvem (criada noutro aparelho/pela web) desaparecia do mapa
// e o cartão da filial nascia vermelho («FALTA CAMPANHA»), travando o acesso.
//
// Esta função reúne as duas fontes com a regra do produto:
//   • local SEM filtro — registros antigos sem contrato (ou de outro casing)
//     continuam a valer, como antes;
//   • `fetchScoped` (local do contrato + nuvem, sem filtro de unidade) só
//     acrescenta campanhas: um registro local nunca desaparece, exceto quando
//     é a MESMA campanha (mesmo `id`), caso em que vale a versão da nuvem.
//
// Em modo INTERNAL (`fetchScoped` devolve só o local, por soberania) o
// resultado é o mesmo da leitura local: campanha que só exista na nuvem NÃO
// liberta a unidade nesse aparelho — tem de ser criada/ativada localmente.
// ============================================================================

import {
  collectActiveCampaignUnits,
  collectRecordedCampaignUnits
} from './unitRelease';

/** Linha de campanha como sai do Dexie/nuvem (campos tolerantes). */
export interface CampaignReleaseRow {
  id?: unknown;
  filial?: unknown;
  unit_id?: unknown;
  _unitid?: unknown;
  status?: unknown;
  tenantid?: unknown;
}

export interface CampaignReleaseSources {
  /** Contrato resolvido (perfil → sessão → base). Vazio = dono global. */
  scope?: string | null;
  /** Leitura local sem filtro de contrato. */
  readLocal: () => Promise<readonly CampaignReleaseRow[]>;
  /** Local do contrato + nuvem, sem filtro de unidade. */
  fetchScoped: (tenantid: string) => Promise<readonly CampaignReleaseRow[]>;
}

export interface CampaignReleaseUnits {
  /** Unidades (chave normalizada) com campanha ACTIVE. */
  active: Set<string>;
  /** Unidades (chave normalizada) com campanha gravada — CREATED ou ACTIVE. */
  recorded: Set<string>;
}

/**
 * Junta as duas fontes **por `id`**: a mesma campanha no local e na nuvem é UMA
 * linha, e a nuvem vence (é a autoridade da campanha — mesma regra do merge de
 * `fetchCampaigns`). Registros sem `id` não podem colidir entre si nem com os
 * identificados: cada um entra pela posição dentro da sua fonte.
 */
export const mergeCampaignRows = (
  local: readonly CampaignReleaseRow[],
  scoped: readonly CampaignReleaseRow[]
): CampaignReleaseRow[] => {
  const keyOf = (row: CampaignReleaseRow, source: 'local' | 'scoped', index: number): string => {
    const id = String(row?.id ?? '').trim();
    return id ? `id:${id}` : `${source}:${index}`;
  };
  const byId = new Map<string, CampaignReleaseRow>();
  local.forEach((row, index) => byId.set(keyOf(row, 'local', index), row));
  scoped.forEach((row, index) => byId.set(keyOf(row, 'scoped', index), row));
  return Array.from(byId.values());
};

/**
 * Unidades que libertam a unidade operacional, a partir do banco local (sem
 * filtro) e das campanhas do contrato (local + nuvem). Nunca lança: uma falha
 * numa fonte não impede a outra de valer.
 */
export async function loadCampaignUnitsForRelease(
  sources: CampaignReleaseSources
): Promise<CampaignReleaseUnits> {
  let localRows: readonly CampaignReleaseRow[] = [];
  try {
    localRows = await sources.readLocal();
  } catch {
    localRows = [];
  }

  let rows: readonly CampaignReleaseRow[] = localRows;
  const scope = String(sources.scope || '').trim();
  if (scope) {
    try {
      const scopedRows = await sources.fetchScoped(scope);
      rows = mergeCampaignRows(localRows, scopedRows || []);
    } catch {
      rows = localRows;
    }
  }

  return {
    active: collectActiveCampaignUnits(rows),
    recorded: collectRecordedCampaignUnits(rows)
  };
}
