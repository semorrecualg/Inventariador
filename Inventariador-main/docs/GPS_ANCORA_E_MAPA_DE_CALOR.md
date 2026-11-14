# Âncora GPS e Mapa de Calor — modelo de dados

Referência curta de como a posição é lida, filtrada e gravada. Complementa
`docs/ARCHITECTURE.md`.

## Onde fica cada parte

| Arquivo | Papel |
|---|---|
| `src/utils/gpsCore.ts` | Núcleo puro: `isValidCoordinate`, `isPreciseFix`, `distanceMeters`, `GpsJitterFilter`, `toGpsFix`, `GPS_ACCURACY`. |
| `src/utils/gpsUtils.ts` | Leitura do sensor (`getCurrentLocation`, `startAutonomousTracking` com `GpsJitterFilter`), contingência da guarda (`getCurrentDeviceLocation`). |
| `src/utils/gpsAnchors.ts` | `hasRealAnchor`, `isRealAnchorRecord`, `collectGpsAnchorsFromStorage`. |
| `src/components/UnitConfigurator.tsx` | Fixa a âncora da unidade (sensor ou bypass sintético), com guarda de precisão. |
| `src/components/GPSComplianceGuard.tsx` | Compara a posição do aparelho com a âncora. |
| `src/components/AssetMap.tsx` | Mapa de calor: plota só coordenadas válidas (`isValidCoordinate`). |
| `src/services/supabaseService.ts` | Persiste/lê `UnitConfig` (SQLite/Dexie/cache local e nuvem `inventory_config` via `upsert` com `onConflict tenantid,filial`). |
| `src/App.tsx` | Deriva unidades com GPS real via `isRealAnchorRecord` e `collectGpsAnchorsFromStorage`. |

## Modelo

**Âncora da unidade** (`UnitConfig`): `filial`/`unit_id`, `tenantid`, `lat`, `lng`,
`radius_meters`, `is_active`, `source` (`'sensor'` | `'synthetic'`, opcional),
`updated_by`, `updated_at`.

- Âncora **real** (conta como unidade com GPS/geocerca): coordenadas finitas,
  não-zero (`hasRealAnchor`) e registro **não** sintético (`isRealAnchorRecord`).
  Registros legados sem `source` são tratados como reais se as coordenadas forem válidas.
- Âncora **sintética** (`source: 'synthetic'`): contingência de BYPASS OFFLINE
  (Brasília-DF). Grava configuração/campanha para liberar a esteira operacional,
  mas **não** conta como unidade com GPS real, **não** alimenta geocerca como
  âncora medida e é ignorada por `isRealAnchorRecord`/`collectGpsAnchorsFromStorage`.

**Leitura do sensor** (`GpsFix` em `gpsCore.ts`): `lat`, `lng`, `accuracy` (m),
`altitude`, `source` (`'sensor'`), `at` (ms). Só existe se `toGpsFix` aceitar a
leitura.

**Posição do ativo**: `latitude` e `longitude`, gravadas apenas com coordenada
válida. Os campos legados `gps_lat`/`gps_lng` são somente leitura.

## Persistência da âncora

- **Normal (fixar âncora):** `UnitConfigurator` grava `source: 'sensor'` via
  `saveUnitConfig` → SQLite físico (`sqliteService.saveUnitConfigToSql`), cache
  `local_unit_configs` (localStorage), Dexie `localDb.unitConfigs.put` e, em modo
  nuvem, `inventory_config` com `upsert(..., { onConflict: 'tenantid,filial' })`.
  Espelhos de leitura rápida: `kardek_gps_ancora_<unidade>`,
  `unit_gps_config_<unidade>`, `gps_lat_`/`gps_lng_` na sessão.
- **Bypass offline (sintético):** grava `source: 'synthetic'` (Brasília-DF) nos
  mesmos repositórios/caches canônicos (`kardek_gps_ancora_`, `unit_gps_config_`,
  etc.), mas **não** grava o par solto `gps_lat_`/`gps_lng_` na sessão, para não
  ser reclassificado como âncora real por leitores que só veem o par de
  coordenadas. Coletores ignoram defensivamente o par `gps_lat_`/`gps_lng_` se o
  `kardek_gps_ancora_<unidade>` local correspondente for sintético.

## Regras

1. Coordenada válida: número finito, dentro de ±90/±180, e não é `(0, 0)`.
2. Leitura utilizável: precisão informada entre 0 (exclusive) e o limite pedido
   (padrão `GPS_ACCURACY.COLLECT`, 50 m).
3. Filtro anti-jitter (`GpsJitterFilter`) descarta, nesta ordem: leitura nula,
   sintética, inválida, imprecisa, repetida (menos de 30 s e menos de 5 m), e
   salto acima de `min(300 m, 15 m/s × tempo)`. A última leitura aceita é a
   referência (usada no rastreio de ativos).
4. **Guarda de precisão ao fixar âncora:** se houver leitura real do hardware
   (`hardwareAccuracy` presente) com `accuracy` acima de `GPS_ACCURACY.COLLECT`,
   a gravação é bloqueada, **exceto** para Admin/Master/Gestor ou quando a
   configuração é explicitamente sintética (`source === 'synthetic'`, bypass/
   marcação manual isenta). Configurações legadas sem `source` continuam
   protegidas.
5. `getCurrentLocation` devolve a última leitura aceita (cache de 30 s) ou
   `null`. `getCurrentDeviceLocation` só usa a âncora da unidade para o perfil
   administrativo; sem âncora e sem leitura, devolve `null`. Nunca há valor
   aleatório.
6. O mapa de calor plota só coordenadas que passam por `isValidCoordinate`.

## Constantes

| Constante | Valor | Uso |
|---|---|---|
| `GPS_ACCURACY.COLLECT` | 50 m | precisão mínima para gravar/aceitar posição |
| `GPS_ACCURACY.MAX_JUMP_METERS` | 300 m | teto de salto entre leituras |
| `GPS_MIN_INTERVAL_MS` | 30 s | intervalo mínimo entre leituras aceitas |
| `GPS_MIN_MOVE_METERS` | 5 m | deslocamento mínimo para nova leitura |
| `GPS_MAX_SPEED_MPS` | 15 m/s | velocidade máxima plausível |

## Bateria

`watchPosition` usa `enableHighAccuracy: false`, `maximumAge: 60000` e
`timeout: 15000`. O filtro evita recalcular a geocerca quando o sinal oscila.

## Regras para novas rotinas

- Não gere coordenada com `Math.random()` nem use a âncora sintética como
  posição de ativo.
- Valide com `isValidCoordinate` antes de gravar, plotar ou agregar; para
  tratar âncora de unidade, use `isRealAnchorRecord` (exclui sintética).
- Use a última leitura aceita pelo `GpsJitterFilter`, não a bruta.
- Qualquer mudança de critério espacial precisa de caso em
  `src/__tests__/gpsCore.test.ts` e/ou `src/__tests__/gpsAnchors.test.ts`.

## Não verificado

- Precisão real em aparelho Android: os limites de 50 m e 300 m precisam de
  teste em campo.
- Comportamento de `maximumAge` no `@capacitor/geolocation` do APK.
