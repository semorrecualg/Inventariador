import { normalizeKey } from './schema';

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

/** Rótulo curto do que falta para liberar a unidade. */
export const describeUnitReleaseMissing = (status: UnitReleaseStatus | null): string => {
  if (!status || status.released) return '';
  const parts: string[] = [];
  if (status.missing.includes('ANCHOR')) parts.push('âncora GPS');
  if (status.missing.includes('CAMPAIGN')) parts.push('campanha');
  return parts.join(' e ');
};
