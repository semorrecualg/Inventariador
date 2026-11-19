/**
 * ÂNCORAS REVOGADAS — apagadas da nuvem em 2026-11-16.
 *
 * Dois registos de `inventory_config` foram removidos por não representarem a
 * posição da filial: `MATRIZ` (unidade que não existe na base) e
 * `010101 CICOPAL GO` (coordenada era o default Brasília do mapa, nunca
 * posicionada). Os aparelhos ainda podem ter estes valores em cache
 * (`local_unit_configs`, Dexie, SQLite, `kardek_gps_ancora_*`) e reenviá-los no
 * próximo salvamento — este módulo é a lista de revogação que impede o regresso
 * deles sem obrigar a limpar o telemóvel à mão.
 *
 * Só a combinação UNIDADE + COORDENADA EXATA é recusada: se a filial for
 * posicionada de novo, num ponto diferente, a gravação passa normalmente.
 */
export interface RevokedAnchor {
  /** Filial (o `unit_id` canónico). */
  unit: string;
  lat: number;
  lng: number;
  reason: string;
}

export const REVOKED_ANCHORS: readonly RevokedAnchor[] = [
  {
    unit: 'MATRIZ',
    lat: -16.7067189,
    lng: -49.1064217,
    reason: 'unidade não existe na base CICOPAL'
  },
  {
    unit: '010101 CICOPAL GO',
    lat: -15.7942,
    lng: -47.8825,
    reason: 'coordenada era o default Brasília do mapa'
  }
];

/** Tolerância de comparação (~0,1 m): as coordenadas viajam como texto/numeric. */
const EPSILON = 1e-6;

/** Mesma normalização usada nas chaves de unidade do resto do app. */
export const normalizeRevokedUnit = (unit: unknown): string =>
  String(unit ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Verdadeiro quando esta unidade+coordenada é uma âncora revogada.
 * Coordenada ausente/inválida nunca corresponde (não há nada a recusar).
 */
export const isRevokedAnchor = (unit: unknown, lat: unknown, lng: unknown): boolean => {
  const unitKey = normalizeRevokedUnit(unit);
  if (!unitKey) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  return REVOKED_ANCHORS.some(
    revoked =>
      normalizeRevokedUnit(revoked.unit) === unitKey &&
      Math.abs(revoked.lat - nLat) < EPSILON &&
      Math.abs(revoked.lng - nLng) < EPSILON
  );
};
