import { hasRealAnchor } from './gpsAnchors';

/** Âncora efetiva de uma filial, já sem proveniência. */
export interface UnitAnchor {
  lat: number;
  lng: number;
  radius_meters: number;
}

export type UnitAnchorSource = 'unit_configs' | 'inventory_config';

const toRadius = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * `unit_configs` é a FONTE CANÓNICA da âncora da filial: uma linha por
 * (tenantid, filial), escrita em todos os salvamentos e com o mesmo contrato
 * entre dispositivos.
 *
 * `inventory_config` continua a ser lido e usado como compatibilidade (builds
 * antigos e aparelhos que ainda não subiram a versão), mas perde a disputa
 * quando a linha de `unit_configs` tem coordenada real. Uma coordenada 0/null
 * em `unit_configs` (ex.: gravação só de flags) NUNCA apaga a âncora: cai para
 * o valor de `inventory_config`.
 *
 * O raio segue a mesma regra: o canónico manda, com recurso ao outro valor
 * quando o canónico não o traz (0 = não informado).
 */
export const resolveCanonicalUnitAnchor = (
  inventoryRow: { lat?: unknown; lng?: unknown; radius_meters?: unknown } | null | undefined,
  unitRow: { lat?: unknown; lng?: unknown; radius_meters?: unknown } | null | undefined
): (UnitAnchor & { source: UnitAnchorSource }) | null => {
  const inventoryRadius = toRadius(inventoryRow?.radius_meters);

  if (hasRealAnchor(unitRow?.lat, unitRow?.lng)) {
    return {
      lat: Number(unitRow?.lat),
      lng: Number(unitRow?.lng),
      radius_meters: toRadius(unitRow?.radius_meters) || inventoryRadius,
      source: 'unit_configs'
    };
  }

  if (hasRealAnchor(inventoryRow?.lat, inventoryRow?.lng)) {
    return {
      lat: Number(inventoryRow?.lat),
      lng: Number(inventoryRow?.lng),
      radius_meters: inventoryRadius,
      source: 'inventory_config'
    };
  }

  return null;
};
