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
  /** Campanha de inventário ATIVA para a unidade. */
  hasCampaign?: boolean;
  /**
   * Campanha GRAVADA para a unidade (CREATED ou ACTIVE) — existe registro, mesmo
   * que ainda não tenha sido ativada. É o que separa "já foi criada" de
   * "falta criar": uma campanha `CREATED` já tem ficha e NÃO deve abrir o
   * cadastro em branco (o que geraria duplicado).
   */
  hasCampaignRecord?: boolean;
}

export interface UnitReleaseStatus {
  hasAnchor: boolean;
  hasCampaign: boolean;
  /** Já existe campanha gravada (criada ou ativa) para a unidade. */
  hasCampaignRecord: boolean;
  /** Liberada para inventário: âncora E campanha ATIVA configuradas. */
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
  // Campanha ativa é, por definição, campanha gravada.
  const hasCampaignRecord = flags?.hasCampaignRecord === true || hasCampaign;
  const missing: UnitReleaseMissing[] = [];
  if (!hasAnchor) missing.push('ANCHOR');
  if (!hasCampaign) missing.push('CAMPAIGN');
  return {
    hasAnchor,
    hasCampaign,
    hasCampaignRecord,
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
          hasCampaign: prev.hasCampaign || status.hasCampaign,
          hasCampaignRecord: prev.hasCampaignRecord || status.hasCampaignRecord
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
 * Unidades que existem na CONFIGURAÇÃO OPERACIONAL do contrato — âncora GPS
 * (`unit_configs`) e campanha (`campaigns`).
 *
 * A lista de filiais do cartão saía apenas dos ativos carregados: um contrato
 * cuja base de ativos ainda não foi baixada aparecia como «Nenhuma filial na
 * base deste contrato», mesmo com âncoras e campanhas gravadas nas filiais.
 * Estes registros são prova de que a filial existe e entra na lista.
 *
 * Regras: só o contrato resolvido (registro de outro contrato não vaza);
 * aceita as três grafias da unidade; devolve nomes legíveis (maiúsculas, sem
 * `_`), únicos e ordenados — a mesma normalização dos ativos.
 */
export const collectConfiguredUnitNames = (
  sources: ReadonlyArray<
    ReadonlyArray<{ tenantid?: unknown; filial?: unknown; unit_id?: unknown; _unitid?: unknown }> | null | undefined
  >,
  tenantid?: string | null
): string[] => {
  const tenant = String(tenantid || '').trim().toUpperCase();
  const names = new Set<string>();
  const sentinels = new Set(['', 'TODAS', 'NULL', 'UNDEFINED', 'DEFAULT', '0', 'SEM FILIAL']);

  for (const list of sources) {
    for (const row of list || []) {
      const rowTenant = String(row?.tenantid || '').trim().toUpperCase();
      // Muro multi-tenant: o registro de outro contrato não entra na lista.
      if (tenant && rowTenant && rowTenant !== tenant) continue;
      const name = String(row?.filial || row?.unit_id || row?._unitid || '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      if (!name || sentinels.has(name)) continue;
      names.add(name);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
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

/**
 * Campanha GRAVADA: `CREATED` (criada, ainda não ativada) ou `ACTIVE`. As duas
 * têm registro na filial — uma `CREATED` já ocupa a unidade e não pode ser
 * tratada como "campanha inexistente" (o cadastro em branco criaria duplicado).
 */
export const isRecordedCampaign = (campaign: { status?: unknown } | null | undefined): boolean => {
  const status = String(campaign?.status || '').trim().toUpperCase();
  return status === 'CREATED' || status === 'ACTIVE';
};

/**
 * Todas as grafias da unidade gravadas na campanha (`filial`, `unit_id`,
 * `_unitid`). A mesma base convive com mais de um campo preenchido e com
 * valores diferentes — comparar só o primeiro escondia campanhas existentes.
 */
export const campaignUnitKeys = (campaign: {
  filial?: unknown;
  unit_id?: unknown;
  _unitid?: unknown;
} | null | undefined): string[] => {
  const keys: string[] = [];
  for (const raw of [campaign?.filial, campaign?.unit_id, campaign?._unitid]) {
    const key = normalizeKey(raw);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
};

/** Conjunto de unidades (normalizadas) com campanha ACTIVE persistida. */
export const collectActiveCampaignUnits = (
  campaigns: ReadonlyArray<{ filial?: unknown; unit_id?: unknown; _unitid?: unknown; status?: unknown }> | null | undefined
): Set<string> => {
  const units = new Set<string>();
  for (const campaign of campaigns || []) {
    if (!isActiveCampaign(campaign)) continue;
    for (const unit of campaignUnitKeys(campaign)) units.add(unit);
  }
  return units;
};

/** Conjunto de unidades com campanha GRAVADA (criada ou ativa). */
export const collectRecordedCampaignUnits = (
  campaigns: ReadonlyArray<{ filial?: unknown; unit_id?: unknown; _unitid?: unknown; status?: unknown }> | null | undefined
): Set<string> => {
  const units = new Set<string>();
  for (const campaign of campaigns || []) {
    if (!isRecordedCampaign(campaign)) continue;
    for (const unit of campaignUnitKeys(campaign)) units.add(unit);
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
 * Rótulo curto do que falta para liberar a unidade.
 *
 * Campanha gravada e ainda não ativa: o que falta NÃO é criar campanha (ela
 * existe, o botão do cartão está verde) — é ativá-la. Dizer "falta campanha"
 * contradizia o próprio cartão e levava a criar duplicado.
 */
export const describeUnitReleaseMissing = (status: UnitReleaseStatus | null): string => {
  if (!status || status.released) return '';
  const parts: string[] = [];
  if (status.missing.includes('ANCHOR')) parts.push('âncora GPS');
  if (status.missing.includes('CAMPAIGN')) {
    parts.push(status.hasCampaignRecord ? 'ativar a campanha' : 'campanha');
  }
  return parts.join(' e ');
};
