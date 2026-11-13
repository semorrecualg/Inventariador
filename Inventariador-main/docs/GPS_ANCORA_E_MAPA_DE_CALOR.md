# Âncora GPS e Mapa de Calor — estado atual e modelo canônico

Documento de referência do subsistema de posição do app. Cobre **onde cada peça
vive**, **como elas se ligam hoje**, **o que foi corrigido** e **qual é o modelo
canônico** de coordenada que as rotinas internas devem consumir.

Complementa `docs/ARCHITECTURE.md`.

---

## 1. Mapa do estado atual

### 1.1 Captura (sensor)

| Arquivo | Papel |
|---|---|
| `src/utils/gpsCore.ts` | **Núcleo único** (novo): validação, faixas de precisão, filtro anti-jitter, suavização e conversão de leitura. Puro, sem React/Capacitor. |
| `src/utils/gpsUtils.ts` | Porta de entrada do sensor: `getPreciseFix()` (leitura real ou `null`), `getCurrentDeviceLocation()` (contingência só com âncora da unidade; sem ela, `null`), `getCurrentLocation()` (cache de 30s; `null` sem leitura precisa), `startAutonomousTracking` / `stopAutonomousTracking` (`watchPosition`), `calculateDistance`, `convertAltitudeToFloor`. |
| `src/components/PermissionGate.tsx` | Pede a permissão de localização (`@capacitor/geolocation`). |
| `src/services/permissionsService.ts` | Verifica/concede permissões de GPS no fluxo de onboarding. |

### 1.2 Âncora (ponto de referência da unidade)

| Arquivo | Papel |
|---|---|
| `src/utils/gpsAnchors.ts` | `hasRealAnchor()` (guarda defensiva de âncora real), `collectGpsAnchorsFromStorage()` (varre `kardek_gps_ancora_*` e `gps_lat_/gps_lng_`), `mergeUnitConfigIntoList()`. |
| `src/components/UnitConfigurator.tsx` | Tela de configuração: mapa MapLibre, círculo de geocerca (`turf.circle`), botão **FIXAR ÂNCORA GPS**, grava âncora em `unit_configs` + `kardek_gps_ancora_<unidade>`; rascunho em `kardek_temp_gps_*`. |
| `src/components/UnitSelector.tsx` | Mostra o status de geocerca por unidade usando `turf.distance` contra a âncora. |
| `src/components/GPSComplianceGuard.tsx` | Guarda de conformidade: mede a distância do aparelho até a âncora e libera/bloqueia o inventário; `watchPosition` contínuo. |
| `src/services/supabaseService.ts` | `saveUnitConfig()` → âncora em `inventory_config`, política/flags em `unit_configs`; `fetchUnitConfigs()` faz merge local + nuvem + âncoras de storage. |
| `src/utils/unitConfigFlags.ts` / `unitRelease.ts` | `hasGps` derivado da âncora real; liberação da unidade = âncora **e** campanha. |
| `src/components/Dashboard.tsx` | Entrada "Ajustar Perímetro Virtual (GPS Geofencing)". |

**Modelo de âncora** (`UnitConfig`, `src/types.ts`): `tenantid`, `filial` (canônico)
/ `_unitid`, `unit_id` (legado), `lat`, `lng`, `radius_meters`, `is_active`,
flags (`hasGps`, `requireNf`, …), `updated_at`, `updated_by`.

### 1.3 Posição do ativo (o que alimenta o mapa)

| Arquivo | Papel |
|---|---|
| `src/types/inventory.ts` | Campos de posição do `Asset`: `latitude`, `longitude`, `_gps_accuracy`, `_gps_source`, `_gps_at` (declarados neste update), `gps_lat`/`gps_lng` (legado), `_altitude_metros`, `_id_andar`. |
| `src/components/AssetDetail.tsx` | Carimba a posição do ativo na edição (antes somava âncora + deslocamento aleatório). |
| `src/components/Inventory.tsx` | Configuração de âncora pelo mapa na tela de inventário. |
| `src/App.tsx` | `patchAsset` com `latitude`/`longitude` + andar no histórico; merge em massa e conferência. |
| `src/components/AssetControlModule.tsx` | Captura `gpsData` (`latitude`/`longitude`) no módulo contábil. |
| `src/services/syncService.ts` | Mapeia `gps_lat`/`gps_lng` para a nuvem. |

### 1.4 Mapa de Calor

| Arquivo | Papel |
|---|---|
| `src/components/AssetMap.tsx` | MapLibre + heatmap. Modos: `DENSITY`, `VALUE`, `AREA`, `GRID`. |
| — | `filteredAssets` = somente `_conferido` (ou `AUDITOR_STATUS_CONFERENCIA === 'SIM'`), filtrado por piso/origem/local. |
| — | `geojsonAssets` (pontos, GPU deve filtrar por piso/origem), `geojsonArea` (convex hull por local via Turf, ≥3 pontos), `gridData`/`geojsonGrid` (binning de ~20 m; O(N) em vez de interseção de polígonos). |
| `src/services/demoSeed.ts` | Gera coordenadas **aleatórias** para a base de demonstração (aceitável apenas em modo demo). |

### 1.5 Como se ligam hoje

```
PermissionGate / permissionsService
        │ permissão
        ▼
UnitConfigurator ── FIXAR ÂNCORA ──▶ unit_configs (Dexie) + kardek_gps_ancora_*
        │                                   │
        │ turf.circle (geocerca)            │ saveUnitConfig()
        ▼                                   ▼
GPSComplianceGuard ◀── hasRealAnchor ── inventory_config (Supabase)
        │ distância até a âncora
        ▼
liberação do inventário
        │
        ▼
Inventory / AssetDetail ── latitude, longitude ──▶ local_assets (Dexie)
        │                                              │ patchAsset
        ▼                                              ▼
AssetMap (heatmap, área, grade)  ◀──────────  syncService → assets (Supabase)
```

---

## 2. Problemas encontrados e corrigidos neste update

| # | Problema | Efeito real | Correção |
|---|---|---|---|
| 1 | `AssetDetail` gerava **`Math.random()`** quando não havia GPS ou o deslocamento era "absurdo" | Pontos falsos no mapa de calor e no relatório; densidade e valores por área errados | Sem âncora real ou sem leitura precisa, o ativo **não recebe** coordenada |
| 2 | `getCurrentDeviceLocation` devolvia a âncora da unidade com **`accuracy: 1.0`** como se fosse leitura do sensor | Conformidade "perfeita" com GPS desligado; auditoria sem prova real | Contingência agora vem com `isSynthetic: true` e `accuracy: NaN`; leitura real passa por `getPreciseFix()` |
| 3 | Leitura usava `enableHighAccuracy: false` e `maximumAge: 60000` | Âncora fixada com erro de centenas de metros | `getPreciseFix()` tenta alta precisão (cache 10s) e repete sem cache; descarta acima de 50 m |
| 4 | Sem filtro de ruído: cada oscilação recalculava o perímetro | Tela piscando entre liberado/fora; bateria e re-render | `GpsJitterFilter`: descarta impreciso, repetido e salto impossível (30s / 5 m / 300 m) |
| 5 | Bloqueio por uma única leitura ruim | Auditor trancado no portão por erro de antena | Histerese: 5% de tolerância na borda + 2 leituras seguidas fora |
| 6 | `watchPosition` com `maximumAge: 30000` e recálculo a cada evento | Consumo desnecessário | `maximumAge: 60000` + gate anti-jitter por deslocamento |
| 7 | `hasRealAnchor` só testava finito e ≠ 0 | Aceitava lat 500 / lng 999 | Usa `isValidCoordinate` (faixas geográficas + rejeita `(0,0)`) |
| 8 | `hasValidCoords` no mapa aceitava `(0,0)` | Ponto espúrio no oceano no heatmap | `hasMapCoords`: coordenada válida + `_gps_source !== 'synthetic'` + precisão ≤ 150 m |
| 9 | Três critérios diferentes de "coordenada boa" (âncora, ativo, mapa) | Divergência entre telas | Um único critério: `gpsCore.isValidCoordinate` |

---

## 3. Modelo canônico

### 3.1 Âncora (por unidade)

```
UnitConfig { tenantid, filial, lat, lng, radius_meters, is_active, flags… }
```

Regras:

- `lat`/`lng` só existem se `isValidCoordinate` passar **e** os dois componentes
  forem diferentes de zero. Zero aqui é convenção de "ausente": uma chave
  `gps_lng_<unidade>` faltando no `sessionStorage` é lida como `0`, e aceitar
  esse zero colocaria a unidade em cima do meridiano de Greenwich.
- `radius_meters` default **500 m**; o bloqueio usa borda com 5% de tolerância.
- A âncora é **ponto de referência**, não posição de ativo: nunca deve ser
  copiada para `asset.latitude` como se fosse uma leitura.

### 3.2 Posição do ativo

| Campo | Tipo | Regra |
|---|---|---|
| `latitude` | number | graus decimais, validado por `isValidCoordinate` |
| `longitude` | number | idem |
| `_gps_accuracy` | number (m) | precisão informada pelo sensor no momento da gravação |
| `_gps_source` | `'sensor' \| 'synthetic'` | `synthetic` **nunca** entra no mapa |
| `_gps_at` | ISO string | instante da leitura |
| `_altitude_metros`, `_id_andar` | number | andar derivado de altitude (3 m/pavimento) |
| `gps_lat`, `gps_lng` | number \| null | **legado** (carga de planilha); leitura apenas |

### 3.3 Contrato de precisão (`GPS_ACCURACY`)

| Constante | Valor | Uso |
|---|---|---|
| `COLLECT` | 50 m | carimbar posição do ativo e decidir geocerca |
| `DISCARD` | 150 m | acima disto é ruído: fora do mapa |
| `MAX_JUMP_METERS` | 300 m | salto considerado impossível |

---

## 3.4 Contrato de `null` e consumo (atualizado)

- `getCurrentLocation()` e `getCurrentDeviceLocation()` **não têm mais coordenada fixa de Goiânia**. Sem leitura válida e precisa (≤ 50 m) e sem âncora da unidade, devolvem `null`.
- Chamadores tratam `null`: o cadastro de ativo (`AssetControlModule`) não grava coordenada e mostra aviso ao usuário; o registro de lote (`App.tsx`) segue sem coordenada; o guard de conformidade (`GPSComplianceGuard`) mostra "sem sinal".
- `startAutonomousTracking` passa toda leitura por `GpsJitterFilter`; só leituras aceitas atualizam a última posição. As rejeitadas são logadas e não são guardadas. O filtro é zerado (`reset`) ao parar o rastreamento.
- Mapa de calor (`AssetMap.tsx`): todos os pontos, o contador e as agregações passam por `hasValidCoords` (que delega a `isValidCoordinate`). Nenhum outro consumidor lê lat/lng cru para plotar.

### 3.5 Bateria (valores escolhidos)

- `watchPosition`: `enableHighAccuracy: false` (rede/Wi-Fi), `maximumAge: 60000` (no máximo 1 leitura por minuto aproveitada), `timeout: 15000`.
- O watch só existe enquanto o rastreamento é necessário: parado no unmount do efeito de Field Mode ou quando a funcionalidade é desligada.
- Captura pontual de ativo usa `getPreciseFix()` (alta precisão, cache de 10s), chamada apenas ao salvar.

### 3.6 Schema do banco

**Não alterado nesta entrega.** O código novo não exige colunas novas: lat/lng continuam em `latitude`/`longitude` e `gps_lat`/`gps_lng`. A proposta da seção 5 (precisão, origem e data no servidor) é uma decisão de migração e fica para depois da aprovação do usuário.

---

## 4. Regras para novas rotinas (obrigatórias)

1. **Nunca** gere coordenada com `Math.random()`, média de coordenadas, nem
   "âncora + desvio". Sem leitura, o resultado é `null` e a UI mostra *sem sinal*.
2. Valide com `isValidCoordinate` / `hasMapCoords` **antes** de gravar, plotar ou
   agregar.
3. Grave sempre o trio `_gps_accuracy`, `_gps_source`, `_gps_at` junto das
   coordenadas — sem isso não há como provar a qualidade do ponto depois.
4. Em `watchPosition`, passe a leitura por `GpsJitterFilter` e use a **última
   aceita**, não a bruta.
5. Consumo no mapa: filtrar por `_conferido` + `hasMapCoords` + piso/origem/local.
   Agregações (densidade, valor por área, convex hull) usam a mesma base filtrada.
6. Testes: qualquer mudança de critério espacial precisa de caso em
   `src/__tests__/gpsCore.test.ts`.

---

## 5. Evolução sugerida (reestruturação)

1. **Persistir a qualidade na nuvem.** Hoje `assets` recebe `gps_lat/gps_lng`, mas
   não a precisão. Proposta (não executar ainda — avaliar junto da migração):

   ```sql
   alter table assets
     add column if not exists gps_accuracy numeric(8,2),
     add column if not exists gps_source   text default 'sensor',
     add column if not exists gps_at       timestamptz;
   create index if not exists assets_gps_idx
     on assets (tenantid, filial) where gps_accuracy is not null;
   ```

2. **Um único carimbo de posição.** Consolidar `latitude`/`longitude` e
   `gps_lat`/`gps_lng` num par canônico; o legado vira leitura temporária.
3. **Âncora versionada.** Guardar `anchor_history` (quem fixou, quando, precisão
   e motivo) — a âncora muda de lugar e hoje não há rastro da mudança.
4. **Mapa de calor como consulta, não varredura.** Para bases grandes, agregar
   por célula (grade de ~20 m) no servidor e trafegar só as células; o app já usa
   binning local, que é o caminho certo.
5. **Anti-fraude de posição** (junto da Malha de Auditoria de Campo): comparar a
   leitura com a âncora e com o histórico do aparelho; bloquear salto impossível
   também na gravação, não só no filtro de tela.

---

## 6. O que **não** foi testado

- Sensor real em aparelho Android: os limites (50/150 m) são conservadores, mas
  precisam de validação em campo.
- `watchPosition` em `@capacitor/geolocation` com `maximumAge: 60000`: o
  comportamento exato difere do navegador e deve ser confirmado no APK.
- Mapa de calor com base grande (12.636 ativos) após o novo filtro: verificar se
  algum ativo legítimo foi excluído por falta de `_gps_accuracy`.
