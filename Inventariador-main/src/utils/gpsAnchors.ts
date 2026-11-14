import { normalizeKey } from './schema';

/**
 * Campos mínimos de um registro de âncora (config, espelho local ou rascunho).
 * `source` ausente = registro legado, anterior à proveniência.
 */
export interface AnchorRecordFields {
  lat?: unknown;
  lng?: unknown;
  source?: unknown;
}

/**
 * Guarda Defensiva: só considera âncora real coordenadas finitas e não-zero.
 * Usada tanto pelo caminho de estado (`unitConfigs`) quanto pela varredura de
 * armazenamento durável — fonte única de verdade (coberta por testes).
 */
export const hasRealAnchor = (lat: unknown, lng: unknown): boolean =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Number(lat) !== 0 && Number(lng) !== 0;

/**
 * Âncora que pode ser contada como LEITURA DE SENSOR.
 *
 * Exige coordenadas válidas e proveniência diferente de `manual`. O pino
 * posicionado por clique/arraste no mapa (`source: 'manual'`) continua sendo
 * âncora para a geocerca, mas NÃO libera unidade, não entra em `unitsWithGps`
 * nem alimenta o mapa de calor.
 *
 * `source` ausente é registro legado (anterior à proveniência): continua
 * contando como sensor para não travar unidades já configuradas. Só um
 * `manual` explícito é excluído.
 */
export const isRealAnchorRecord = (record: AnchorRecordFields | null | undefined): boolean =>
  !!record && record.source !== 'manual' && hasRealAnchor(record.lat, record.lng);

/** JSON de storage sem derrubar a varredura quando o valor é inválido. */
const readJson = (
  storage: Pick<Storage, 'getItem'>,
  key: string
): Record<string, unknown> | null => {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/**
 * Varre o armazenamento durável do navegador e devolve o conjunto de unidades
 * (chaves normalizadas) com âncora contável como leitura de sensor — as mesmas
 * que liberam unidade e entram em `unitsWithGps`.
 *
 * Chaves lidas:
 *  - localStorage:  `kardek_gps_ancora_<unidade>` (JSON { filial/unit_id, lat, lng, source })
 *  - sessionStorage: `gps_lat_<unidade>` + `gps_lng_<unidade>`, com a proveniência
 *    lida de `unit_gps_config_<unidade>` (gravada no salvamento). Rascunho sem
 *    config salva é posicionamento manual e não conta como sensor.
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
        const rec = readJson(local, key);
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
        const lat = session.getItem(key);
        const lng = session.getItem(`gps_lng_${unit}`);
        const saved = readJson(session, `unit_gps_config_${unit}`);
        // Sem config salva não há como provar leitura de sensor: rascunho = manual.
        const source = saved ? saved.source : 'manual';
        if (unit && isRealAnchorRecord({ lat, lng, source })) {
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
