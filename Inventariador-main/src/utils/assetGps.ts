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

/**
 * Colunas `gps_lat`/`gps_lng` para o upsert da nuvem.
 *
 * Sem leitura válida devolve `{}` — e não `{ gps_lat: null, gps_lng: null }`.
 * No `ON CONFLICT DO UPDATE` a coluna ausente do payload fica como está, por
 * isso um ativo conferido sem GPS (ou com a leitura descartada) não pode
 * apagar a coordenada que outro aparelho já gravou na nuvem.
 */
export const assetGpsColumns = (asset: unknown): { gps_lat?: number; gps_lng?: number } => {
  const gps = assetGpsPair(asset);
  return gps ? { gps_lat: gps.lat, gps_lng: gps.lng } : {};
};

/**
 * O PONTO DA LEITURA DE CAMPO MAIS RECENTE VENCE O PULL
 * ============================================================================
 * O pull remontava a linha do ativo a partir da nuvem, e o ponto descia com
 * ela. Um aparelho que já tinha lido o GPS no campo recebia de volta a
 * coordenada antiga que a nuvem ainda guardava (envio anterior, outro aparelho,
 * coluna `gps_lat` que só agora existe) e o mapa de calor voltava ao ponto
 * errado — sem que ninguém tivesse tocado no ativo outra vez.
 *
 * A regra é por TEMPO, como a decisão da conferência (ver `utils/conferencia`):
 *   1. sem ponto local válido, não há nada a defender — a nuvem fica;
 *   2. a nuvem sem ponto não apaga a leitura local (a coluna ausente do upsert
 *      já não limpa a coordenada do outro lado, ver `assetGpsColumns`);
 *   3. com ponto dos dois lados, vence o mais recente; sem data de nenhum dos
 *      lados, a nuvem fica. Nunca se inventa uma data para o carimbo local.
 *
 * Devolve só o par a repor (vazio quando a nuvem vence), para o merge fazer
 * `{ ...linhaDaNuvem, ...preservarGpsMaisRecente(local, linhaDaNuvem) }`.
 */

/** Data legível do ponto: a do GPS quando existir, senão a da leitura/toque. */
const dataDoPonto = (asset: unknown): string | null => {
  if (!asset || typeof asset !== 'object') return null;
  const row = asset as Record<string, unknown>;
  const candidatos = [row._gps_at, row._dataLeitura, row._lastUpdated, row.updated_at];
  for (const valor of candidatos) {
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (texto) return texto;
  }
  return null;
};

const instanteDoPonto = (asset: unknown): number | null => {
  const data = dataDoPonto(asset);
  if (!data) return null;
  const instante = new Date(data).getTime();
  return Number.isFinite(instante) ? instante : null;
};

export const preservarGpsMaisRecente = (
  local: unknown,
  nuvem: unknown
): { latitude?: number; longitude?: number; gps_lat?: number; gps_lng?: number } => {
  const gpsLocal = assetGpsPair(local);
  if (!gpsLocal) return {};
  const gpsNuvem = assetGpsPair(nuvem);
  const repor = () => ({
    latitude: gpsLocal.lat,
    longitude: gpsLocal.lng,
    gps_lat: gpsLocal.lat,
    gps_lng: gpsLocal.lng,
  });
  if (!gpsNuvem) return repor();

  const tLocal = instanteDoPonto(local);
  if (tLocal === null) return {}; // sem data local, não se afirma que é mais nova
  const tNuvem = instanteDoPonto(nuvem);
  if (tNuvem !== null && tNuvem >= tLocal) return {};
  return repor();
};
