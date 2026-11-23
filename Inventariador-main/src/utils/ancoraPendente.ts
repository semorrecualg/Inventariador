import { hasRealAnchor } from './gpsAnchors';
import { normalizeKey } from './schema';
import type { UnitConfig } from '../types';

/**
 * ÂNCORA POR SUBIR — a fila durável da âncora que não chegou à nuvem.
 *
 * F5 (âncora GPS e regras da unidade) tem um portão concreto: *a âncora volta
 * noutro aparelho*. Para isso a âncora tem de existir na nuvem, mas o
 * `UnitConfigurator` grava-a primeiro no aparelho — e é isso que deve
 * continuar a acontecer em campo. Quando a gravação na nuvem não é confirmada
 * (sem rede, BASE LOCAL ou erro do servidor), o registro fica aqui e é
 * reenviado pelo `flushAncorasPendentes` assim que houver nuvem.
 *
 * Sem esta fila, marcar a âncora em modo avião e reconectar deixava-a só no
 * telemóvel: outro aparelho continuava em «FALTA ÂNCORA GPS».
 *
 * Módulo puro (storage por parâmetro) para ser testado sem jsdom; a escrita
 * nunca lança — uma quota cheia não pode impedir a gravação local da âncora.
 */

export const ANCORA_PENDENTE_KEY = 'gbr_unit_config_pending';

export interface AncoraPendente {
  tenantid: string;
  filial: string;
  /** Config completa (coordenadas, raio, proveniência, flags) pronta a reenviar. */
  config: UnitConfig;
  /** Instante em que a gravação na nuvem falhou — para auditoria/diagnóstico. */
  saved_at: string;
}

/** Storage mínimo usado pela fila (localStorage em produção, mock nos testes). */
export type PendingAnchorStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const chaveDaUnidade = (tenantid: unknown, filial: unknown): string =>
  `${normalizeKey(String(tenantid ?? ''))}|${normalizeKey(String(filial ?? ''))}`;

const filialDoConfig = (config: Record<string, unknown>): string =>
  String(config.filial || config.unit_id || config._unitid || '').trim();

const isAncoraPendente = (value: unknown): value is AncoraPendente => {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  const config = rec.config;
  if (!config || typeof config !== 'object') return false;
  const cfg = config as Record<string, unknown>;
  // Mesma guarda canónica da âncora: zero/NaN/lat 500 não voltam a subir.
  return (
    hasRealAnchor(cfg.lat, cfg.lng) &&
    !!String(rec.tenantid ?? '').trim() &&
    !!filialDoConfig(cfg)
  );
};

/** Fila inteira, já sem lixo (JSON quebrado, coordenada inválida, unidade vazia). */
export const lerAncorasPendentes = (storage: PendingAnchorStorage): AncoraPendente[] => {
  try {
    const raw = storage.getItem(ANCORA_PENDENTE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAncoraPendente) : [];
  } catch {
    return [];
  }
};

export const contarAncorasPendentes = (storage: PendingAnchorStorage): number =>
  lerAncorasPendentes(storage).length;

/**
 * Registra (ou atualiza) a âncora de uma unidade na fila de envio. Uma unidade
 * pesa uma vez só: dois salvamentos sem rede sucessivos ficam com a posição
 * mais recente. Devolve o total em fila.
 */
export const registarAncoraPendente = (
  storage: PendingAnchorStorage,
  config: UnitConfig,
  savedAt: string = new Date().toISOString()
): number => {
  const tenantid = String(config.tenantid ?? '').trim();
  const filial = filialDoConfig(config as unknown as Record<string, unknown>);
  if (!tenantid || !filial || !hasRealAnchor(config.lat, config.lng)) {
    return contarAncorasPendentes(storage);
  }

  const chave = chaveDaUnidade(tenantid, filial);
  const fila = lerAncorasPendentes(storage).filter(
    item => chaveDaUnidade(item.tenantid, item.filial) !== chave
  );
  fila.push({
    tenantid,
    filial,
    config: { ...config, tenantid, filial, unit_id: filial },
    saved_at: savedAt
  });

  try {
    storage.setItem(ANCORA_PENDENTE_KEY, JSON.stringify(fila));
  } catch {
    /* quota cheia/storage bloqueado: a âncora local continua garantida */
  }
  return fila.length;
};

/** Remove da fila a unidade já confirmada na nuvem (ou revogada). */
export const removerAncoraPendente = (
  storage: PendingAnchorStorage,
  tenantid: unknown,
  filial: unknown
): void => {
  const chave = chaveDaUnidade(tenantid, filial);
  const fila = lerAncorasPendentes(storage).filter(
    item => chaveDaUnidade(item.tenantid, item.filial) !== chave
  );
  try {
    if (fila.length === 0) storage.removeItem(ANCORA_PENDENTE_KEY);
    else storage.setItem(ANCORA_PENDENTE_KEY, JSON.stringify(fila));
  } catch {
    /* idem */
  }
};
