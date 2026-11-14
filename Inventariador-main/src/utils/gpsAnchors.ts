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
 * Um REGISTRO de âncora só vale como real se as coordenadas passarem em
 * `hasRealAnchor` e ele não estiver marcado como sintético.
 *
 * O BYPASS OFFLINE do UnitConfigurator grava Brasília-DF com lat/lng numéricos
 * (não-zero) para liberar a esteira operacional. Sem esta marca, essa
 * contingência passaria por âncora medida e alimentaria geocerca e mapa.
 * Registros legados sem `source` continuam valendo como reais.
 */
export const isRealAnchorRecord = (rec: unknown): boolean => {
  const r = rec as Record<string, unknown> | null | undefined;
  if (!r) return false;
  if (r.source === 'synthetic') return false;
  return hasRealAnchor(r.lat, r.lng);
};

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
        if (uId && isRealAnchorRecord(rec)) {
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
        if (!unit || !hasRealAnchor(lat, lng)) continue;
        try {
          const localRec = JSON.parse(local.getItem(`kardek_gps_ancora_${unit}`) || 'null') as Record<string, unknown> | null;
          if (localRec?.source === 'synthetic') continue;
        } catch { /* ignora leitura */ }
        anchors.add(normalizeKey(unit));
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
