/**
 * Ponte única entre a grafia do app e a da nuvem para o ponto do ativo.
 *
 * O app grava a posição da conferência em `latitude`/`longitude` (ver
 * `docs/GPS_ANCORA_E_MAPA_DE_CALOR.md` § 3.2), mas a tabela `assets` do
 * Supabase guarda o mesmo par nas colunas `gps_lat`/`gps_lng`. Sem esta
 * conversão o envio subia o ativo sem coordenada, o pull descia a linha com
 * `gps_lat` e a ficha/mapa de calor liam `latitude` vazia.
 *
 * A ordem de leitura é a da canónica para a legada: `latitude`/`longitude`
 * primeiro, `gps_lat`/`gps_lng` como contingência (carga de planilha antiga).
 */

import { isValidCoordinate } from './gpsCore';

export interface AssetGpsPair {
  lat: number;
  lng: number;
}

/**
 * Converte um valor vindo do Dexie/Postgres num número finito, sem os atalhos
 * do `Number()`: `null`, `undefined` e `''` são ausência de leitura, e não 0 —
 * um `Number(null)` silencioso colocaria o ativo na latitude do Equador.
 */
const toCoordinate = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/**
 * Devolve o par utilizável do ativo, ou `null` quando não há leitura válida.
 * Valida com `isValidCoordinate` (faixas geográficas e rejeição do par 0,0).
 */
export const assetGpsPair = (asset: unknown): AssetGpsPair | null => {
  if (!asset || typeof asset !== 'object') return null;
  const row = asset as Record<string, unknown>;

  const candidates: Array<[unknown, unknown]> = [
    [row.latitude, row.longitude],
    [row.gps_lat, row.gps_lng],
  ];

  for (const [rawLat, rawLng] of candidates) {
    const lat = toCoordinate(rawLat);
    const lng = toCoordinate(rawLng);
    if (lat === null || lng === null) continue;
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  return null;
};
