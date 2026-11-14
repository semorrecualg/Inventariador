import { matchUnitKeys, normalizeKey } from './schema';

/**
 * LIBERAÇÃO DA UNIDADE OPERACIONAL PARA O INVENTÁRIO (GBR KARDEK)
 *
 * Regra do produto: o ADMIN/MASTER cadastra o usuário auditor, carrega a base e
 * prepara a UNIDADE OPERACIONAL — âncora GPS + campanha de inventário. Somente
 * com as DUAS configurações a unidade fica liberada para o inventário de campo.
 *
 * A tela UNIDADE OPERACIONAL (`/unit`) é administrativa; o auditor recebe a
 * filial no CONTRATO DE TRABALHO (`/contexto`) e só entra nas unidades
 * liberadas. Este módulo é a regra única dessa liberação — usada pelo seletor
 * de contexto e pela entrada do módulo, para que as duas nunca divirjam.
 */

export type UnitReleaseMissing = 'ANCHOR' | 'CAMPAIGN';

export interface UnitReleaseFlags {
  /** Âncora GPS configurada para a unidade (coordenada real, não-zero). */
  hasAnchor?: boolean;
  /** Campanha de inventário aberta/ativa para a unidade. */
  hasCampaign?: boolean;
}

export interface UnitReleaseStatus {
  hasAnchor: boolean;
  hasCampaign: boolean;
  /** Liberada para inventário: âncora E campanha configuradas. */
  released: boolean;
  /** O que falta configurar (vazio quando liberada). */
  missing: UnitReleaseMissing[];
}

/** Mapa `TENANTID::FILIAL` → estado de liberação. */
export type UnitReleaseMap = Record<string, UnitReleaseStatus>;

/** Unidade no formato entregue por `fullCompaniesWithStatus`. */
export interface UnitReleaseCandidate extends UnitReleaseFlags {
  name: string;
  tenantid?: string;
}

/** Estado de uma unidade a partir das flags de configuração. */
export const resolveUnitReleaseStatus = (flags?: UnitReleaseFlags | null): UnitReleaseStatus => {
  const hasAnchor = flags?.hasAnchor === true;
  const hasCampaign = flags?.hasCampaign === true;
  const missing: UnitReleaseMissing[] = [];
  if (!hasAnchor) missing.push('ANCHOR');
  if (!hasCampaign) missing.push('CAMPAIGN');
  return {
    hasAnchor,
    hasCampaign,
    released: hasAnchor && hasCampaign,
    missing
  };
};

/**
 * Chave composta da unidade. O contrato entra na chave porque a MESMA filial em
 * contratos diferentes é uma unidade distinta (mesmo muro multi-tenant da base).
 */
export const unitReleaseKey = (
  tenantid: string | null | undefined,
  filial: string | null | undefined
): string => {
  const tenant = String(tenantid || '').trim().toUpperCase();
  const unit = normalizeKey(filial || '');
  return unit ? `${tenant}::${unit}` : '';
};

/**
 * Monta o mapa de liberação a partir das unidades detectadas na base. Linhas
 * repetidas da mesma chave são somadas (âmbito liberado se qualquer registro
 * trouxe a configuração) — a unidade é a mesma.
 */
export const buildUnitReleaseMap = (
  units: ReadonlyArray<UnitReleaseCandidate> | null | undefined
): UnitReleaseMap => {
  const map: UnitReleaseMap = {};
  for (const unit of units || []) {
    const key = unitReleaseKey(unit?.tenantid, unit?.name);
    if (!key) continue;
    const status = resolveUnitReleaseStatus(unit);
    const prev = map[key];
    map[key] = prev
      ? resolveUnitReleaseStatus({
          hasAnchor: prev.hasAnchor || status.hasAnchor,
          hasCampaign: prev.hasCampaign || status.hasCampaign
        })
      : status;
  }
  return map;
};

/**
 * Estado de liberação de uma filial.
 *
 * Devolve `null` quando a unidade não aparece na base carregada — desconhecida
 * NÃO é prova de falta de configuração, e travar aí bloquearia o auditor por
 * um dado que o app nem consegue ler. Só bloqueia quando há evidência de que
 * âncora ou campanha estão por configurar.
 */
export const readUnitRelease = (
  map: UnitReleaseMap | null | undefined,
  tenantid: string | null | undefined,
  filial: string | null | undefined
): UnitReleaseStatus | null => {
  if (!map) return null;
  const key = unitReleaseKey(tenantid, filial);
  if (!key) return null;
  const exact = map[key];
  if (exact) return exact;

  // Perfil sem contrato resolvido (dono global): procura a filial em qualquer
  // contrato — o nome da unidade continua sendo a identidade visível.
  const unit = normalizeKey(filial || '');
  const suffix = `::${unit}`;
  for (const [entryKey, status] of Object.entries(map)) {
    if (entryKey.endsWith(suffix)) return status;
  }
  return null;
};

/**
 * CAMPANHA: leitura única (GBR KARDEK)
 *
 * A campanha é uma propriedade da UNIDADE, não do ecrã que a mostrou. Antes o
 * mapa de liberação saía de uma lista filtrada/paginada por ecrã, então uma
 * campanha ACTIVE gravada no banco podia não chegar ao chip do contrato de
 * trabalho. Estas funções leem o registro persistido (SQLite/Dexie) e reduzem
 * tudo a um conjunto de unidades — mesma regra para chip, trava e gestão.
 */

/** Unidade de uma campanha, aceitando os três nomes de campo usados na base. */
export const campaignUnitOf = (campaign: {
  filial?: unknown;
  unit_id?: unknown;
  _unitid?: unknown;
} | null | undefined): string =>
  String(campaign?.filial || campaign?.unit_id || campaign?._unitid || '').trim();

/** Campanha aberta para inventário: só `ACTIVE` libera a unidade. */
export const isActiveCampaign = (campaign: { status?: unknown } | null | undefined): boolean =>
  String(campaign?.status || '').trim().toUpperCase() === 'ACTIVE';

/** Conjunto de unidades (normalizadas) com campanha ACTIVE persistida. */
export const collectActiveCampaignUnits = (
  campaigns: ReadonlyArray<{ filial?: unknown; unit_id?: unknown; _unitid?: unknown; status?: unknown }> | null | undefined
): Set<string> => {
  const units = new Set<string>();
  for (const campaign of campaigns || []) {
    if (!isActiveCampaign(campaign)) continue;
    const unit = normalizeKey(campaignUnitOf(campaign));
    if (unit) units.add(unit);
  }
  return units;
};

/**
 * A unidade está no conjunto? Exato primeiro (O(1)) e depois tolerante — a
 * mesma base convive com `010101_CICOPAL_GO` e `010101 CICOPAL GO`.
 */
export const isUnitInReleaseSet = (
  units: ReadonlySet<string> | null | undefined,
  filial: string | null | undefined
): boolean => {
  if (!units || units.size === 0) return false;
  const unit = normalizeKey(filial || '');
  if (!unit) return false;
  if (units.has(unit)) return true;
  for (const entry of units) {
    if (matchUnitKeys(entry, unit)) return true;
  }
  return false;
};

/** Prefixo do cache local que espelha campanha activa por unidade. */
export const ACTIVE_CAMPAIGN_CACHE_PREFIX = 'kardek_campanha_ativa_';

/** Unidades marcadas no cache local (ativação feita em qualquer ecrã). */
export const readActiveCampaignCache = (
  storage: { key: (i: number) => string | null; length: number; getItem: (k: string) => string | null } | null | undefined
): Set<string> => {
  const units = new Set<string>();
  if (!storage) return units;
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(ACTIVE_CAMPAIGN_CACHE_PREFIX)) continue;
      if (storage.getItem(key) !== 'true') continue;
      const unit = normalizeKey(key.slice(ACTIVE_CAMPAIGN_CACHE_PREFIX.length));
      if (unit) units.add(unit);
    }
  } catch {
    return units;
  }
  return units;
};

/**
 * Remove do cache local a marca de campanha ACTIVA de uma unidade.
 *
 * Chamado ao excluir a campanha: o cache é derivado do banco, e sem esta
 * limpeza o chip CAMPANHA e a liberação continuavam a apontar para uma
 * campanha que já não existe (a linha saiu da tabela, o "ativo" ficou).
 */
export const clearActiveCampaignCacheForUnit = (
  storage: { key: (i: number) => string | null; length: number; removeItem: (k: string) => void } | null | undefined,
  unit: string | null | undefined
): void => {
  const target = normalizeKey(unit || '');
  if (!storage || !target) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(ACTIVE_CAMPAIGN_CACHE_PREFIX)) continue;
      if (normalizeKey(key.slice(ACTIVE_CAMPAIGN_CACHE_PREFIX.length)) === target) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  } catch {
    /* cache best-effort: falha de storage não pode abortar a exclusão */
  }
};

/**
 * Ponteiros de "campanha corrente" espalhados pelo app.
 *
 * Nenhum deles é fonte de verdade: todos apontam para uma linha da tabela
 * `campaigns` por id. Quando essa linha desaparece (exclusão, base trocada), o
 * ponteiro fica órfão e a unidade continuava "liberada" sem campanha nenhuma.
 */
export interface CampaignPointerSnapshot {
  /** `localStorage.app_current_campaign` */
  appCurrentCampaign?: string | null;
  /** `sessionStorage.activeCampaignId` */
  sessionCampaignId?: string | null;
  /** `SYSTEM_CONTEXT.active_campaign` */
  contextCampaignId?: string | null;
}

export interface ActiveCampaignReconciliation {
  /** Ids referenciados que NÃO existem em `campaigns`. */
  orphanCampaignIds: string[];
  /** Unidades marcadas no cache local sem campanha ACTIVE no banco. */
  staleCacheUnits: string[];
}

/**
 * Reconcilia o estado derivado da campanha activa com a tabela `campaigns`.
 *
 * - Um id referenciado que não existe na tabela é órfão (o chip CAMPANHA e a
 *   campanha corrente passam a mentir sobre uma campanha inexistente).
 * - Uma marca de cache (`kardek_campanha_ativa_*`) só é válida se a unidade
 *   tiver campanha ACTIVE persistida — o cache é espelho, não fonte.
 */
export const reconcileActiveCampaignState = (
  campaigns: ReadonlyArray<{ id?: unknown; status?: unknown; filial?: unknown; unit_id?: unknown; _unitid?: unknown }> | null | undefined,
  pointers: CampaignPointerSnapshot | null | undefined,
  cachedUnits?: ReadonlySet<string> | null
): ActiveCampaignReconciliation => {
  const ids = new Set<string>();
  for (const campaign of campaigns || []) {
    const id = String(campaign?.id ?? '').trim();
    if (id) ids.add(id);
  }

  const orphanCampaignIds: string[] = [];
  const seen = new Set<string>();
  [pointers?.contextCampaignId, pointers?.appCurrentCampaign, pointers?.sessionCampaignId].forEach(pointer => {
    const id = String(pointer ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    if (!ids.has(id)) orphanCampaignIds.push(id);
  });

  const activeUnits = collectActiveCampaignUnits(campaigns);
  const staleCacheUnits: string[] = [];
  for (const unit of cachedUnits || []) {
    if (!isUnitInReleaseSet(activeUnits, unit)) staleCacheUnits.push(unit);
  }

  return { orphanCampaignIds, staleCacheUnits };
};

/**
 * Texto do rodapé de campanhas. Sempre derivado da leitura persistida: o
 * contador não pode ficar preso no valor anterior depois de uma exclusão.
 */
export const formatCampaignCount = (campaigns: ReadonlyArray<unknown> | null | undefined): string =>
  `Campanhas encontradas: ${campaigns?.length ?? 0}`;

/** Rótulo curto do que falta para liberar a unidade. */
export const describeUnitReleaseMissing = (status: UnitReleaseStatus | null): string => {
  if (!status || status.released) return '';
  const parts: string[] = [];
  if (status.missing.includes('ANCHOR')) parts.push('âncora GPS');
  if (status.missing.includes('CAMPAIGN')) parts.push('campanha');
  return parts.join(' e ');
};
