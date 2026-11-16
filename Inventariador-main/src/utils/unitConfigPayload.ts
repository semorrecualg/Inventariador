import { hasRealAnchor } from './gpsAnchors';
import { buildUnitFlags, pickUnitFlags } from './unitConfigFlags';
import type { UnitConfig } from '../types';

/**
 * Payload da linha `unit_configs` (fonte canónica da âncora).
 *
 * As coordenadas só entram quando são reais. Uma gravação que só traz flags
 * (bypass de campanha, política da filial) não pode escrever `lat: 0` por cima
 * da âncora já fixada — era isso que apagava a posição da unidade assim que
 * `unit_configs` passou a vencer `inventory_config` na leitura.
 */
export const buildUnitConfigRowPayload = (
  config: UnitConfig,
  storedFlags: unknown,
  tenantid: string,
  filial: string
): Record<string, unknown> => {
  const hasAnchor = hasRealAnchor(config.lat, config.lng);

  const payload: Record<string, unknown> = {
    tenantid,
    filial,
    unit_id: filial,
    is_active: config.is_active !== false,
    updated_by: String(config.updated_by || 'system'),
    updated_at: new Date().toISOString(),
    flags: { ...pickUnitFlags(storedFlags), ...buildUnitFlags(config, hasAnchor) }
  };

  if (hasAnchor) {
    payload.lat = Number(config.lat);
    payload.lng = Number(config.lng);
    payload.radius_meters = Number(config.radius_meters) || 0;
  }

  return payload;
};
