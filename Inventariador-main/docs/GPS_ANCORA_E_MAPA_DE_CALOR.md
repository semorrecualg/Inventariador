# Âncora GPS e Mapa de Calor — modelo de dados

Referência curta de como a posição é lida, filtrada e gravada. Complementa
`docs/ARCHITECTURE.md`.

## Onde fica cada parte

| Arquivo | Papel |
|---|---|
| `src/utils/gpsCore.ts` | Núcleo puro: `isValidCoordinate`, `isPreciseFix`, `distanceMeters`, `GpsJitterFilter`, `toGpsFix`, `GPS_ACCURACY`. |
| `src/utils/gpsUtils.ts` | Leitura do sensor (`getCurrentLocation`, `startAutonomousTracking`), contingência da guarda (`getCurrentDeviceLocation`). |
| `src/utils/gpsAnchors.ts` | `hasRealAnchor`, `collectGpsAnchorsFromStorage`. |
| `src/components/UnitConfigurator.tsx` | Fixa a âncora da unidade (`kardek_gps_ancora_<unidade>`). |
| `src/components/GPSComplianceGuard.tsx` | Compara a posição do aparelho com a âncora. |
| `src/components/AssetMap.tsx` | Mapa de calor: plota só coordenadas válidas (`isValidCoordinate`). |

## Modelo

**Âncora da unidade** (`UnitConfig`): `filial`, `lat`, `lng`, `radius_meters`,
`is_active`. Só é usada se `hasRealAnchor` aceitar `lat`/`lng`.

**Leitura do sensor** (`GpsFix`): `lat`, `lng`, `accuracy` (m), `altitude`,
`source` (`'sensor'`), `at` (ms). Só existe se `toGpsFix` aceitar a leitura.

**Posição do ativo**: `latitude` e `longitude`, gravadas apenas com coordenada
válida. Os campos legados `gps_lat`/`gps_lng` são somente leitura.

## Regras

1. Coordenada válida: número finito, dentro de ±90/±180, e não é `(0, 0)`.
2. Leitura utilizável: precisão informada entre 0 (exclusive) e 50 m.
3. Filtro anti-jitter (`GpsJitterFilter`) descarta, nesta ordem: leitura nula,
   sintética, inválida, imprecisa, repetida (menos de 30 s e menos de 5 m), e
   salto acima de `min(300 m, 15 m/s × tempo)`. A última leitura aceita é a
   referência.
4. `getCurrentLocation` devolve a última leitura aceita (cache de 30 s) ou
   `null`. `getCurrentDeviceLocation` só usa a âncora da unidade para o perfil
   administrativo; sem âncora e sem leitura, devolve `null`. Nunca há valor
   aleatório.
5. O mapa de calor plota só coordenadas que passam por `isValidCoordinate`.

## Constantes

| Constante | Valor | Uso |
|---|---|---|
| `GPS_ACCURACY.COLLECT` | 50 m | precisão mínima para gravar posição |
| `GPS_ACCURACY.MAX_JUMP_METERS` | 300 m | teto de salto entre leituras |
| `GPS_MIN_INTERVAL_MS` | 30 s | intervalo mínimo entre leituras aceitas |
| `GPS_MIN_MOVE_METERS` | 5 m | deslocamento mínimo para nova leitura |
| `GPS_MAX_SPEED_MPS` | 15 m/s | velocidade máxima plausível |

## Bateria

`watchPosition` usa `enableHighAccuracy: false`, `maximumAge: 60000` e
`timeout: 15000`. O filtro evita recalcular a geocerca quando o sinal oscila.

## Regras para novas rotinas

- Não gere coordenada com `Math.random()` nem use a âncora como posição de ativo.
- Valide com `isValidCoordinate` antes de gravar, plotar ou agregar.
- Use a última leitura aceita pelo `GpsJitterFilter`, não a bruta.
- Qualquer mudança de critério espacial precisa de caso em
  `src/__tests__/gpsCore.test.ts`.

## Não verificado

- Precisão real em aparelho Android: os limites de 50 m e 300 m precisam de
  teste em campo.
- Comportamento de `maximumAge` no `@capacitor/geolocation` do APK.
