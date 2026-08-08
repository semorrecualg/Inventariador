import { normalizeKey } from './schema';

/**
 * Guarda Defensiva: só considera âncora real coordenadas finitas e não-zero.
 * Usada tanto pelo caminho de estado (`unitConfigs`) quanto pela varredura de
 * armazenamento durável — fonte única de verdade (coberta por testes).
 */
export const hasRealAnchor = (lat: unknown, lng: unknown): boolean =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Number(lat) !== 0 && Number(lng) !== 0;

/**
 * Varre o armazenamento durável do navegador e devolve o conjunto de unidades
 * (chaves normalizadas) que possuem âncora GPS real.
 *
 * Chaves lidas:
 *  - localStorage:  `kardek_gps_ancora_<unidade>` (JSON { filial/unit_id, lat, lng })
 *  - sessionStorage: `gps_lat_<unidade>` + `gps_lng_<unidade>`
 *
 * Recebe os storages por parâmetro (interface mínima) para ser testável com
 * mocks sem depender de jsdom. Qualquer falha de storage é silenciosa.
 */
export const collectGpsAnchorsFromStorage = (
  local: Pick<Storage, 'length' | 'key' | 'getItem'>,
  session: Pick<Storage, 'length' | 'key' | 'getItem'>
): Set<string> => {
  const anchors = new Set<string>();

  try {
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key && key.startsWith('kardek_gps_ancora_')) {
        const rec = JSON.parse(local.getItem(key) || 'null') as Record<string, unknown> | null;
        const uId = rec?.filial || rec?.unit_id || rec?._unitid;
        if (uId && hasRealAnchor(rec?.lat, rec?.lng)) {
          anchors.add(normalizeKey(String(uId)));
        }
      }
    }
  } catch { /* storage indisponível — ignora */ }

  try {
    for (let i = 0; i < session.length; i++) {
      const key = session.key(i);
      if (key && key.startsWith('gps_lat_')) {
        const unit = key.slice('gps_lat_'.length);
        const lat = Number(session.getItem(key));
        const lng = Number(session.getItem(`gps_lng_${unit}`));
        if (unit && hasRealAnchor(lat, lng)) {
          anchors.add(normalizeKey(unit));
        }
      }
    }
  } catch { /* storage indisponível — ignora */ }

  return anchors;
};

/**
 * Merge de uma config de unidade numa lista (sem mutar a entrada). Usado pelo
 * UnitConfigurator no FIXAR ÂNCORA GPS e no BYPASS OFFLINE para notificar o App
 * com a lista JÁ atualizada — nunca mais a closure obsoleta sem a âncora.
 */
export const mergeUnitConfigIntoList = <T extends { unit_id?: string }>(
  configs: T[],
  config: T
): T[] => {
  const list = [...configs];
  const unitId = config.unit_id;
  const idx = unitId ? list.findIndex(c => c.unit_id === unitId) : -1;
  if (idx >= 0) list[idx] = { ...list[idx], ...config };
  else list.push(config);
  return list;
};
