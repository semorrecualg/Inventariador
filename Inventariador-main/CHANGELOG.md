# Changelog

All notable changes to the GBR KARDEK Inventariador project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Muro multi-tenant ponta a ponta — isolamento por `tenantid` (usuário × contrato)

Fechamento do muro de isolamento entre contratos no local e na nuvem, com login
estritamente amarrado ao contrato do usuário (sem "GLOBAL").

- **Chave composta local `[tenantid+primarykey]`** — migração Dexie v6→v7 em 2 passos
  (v6: DROP + backup integral; v7: RECREATE + restauração), preservando 100% dos
  registros; `primarykey` vira índice. Dois contratos com a mesma chave de origem
  coexistem sem colidir. Guard `filterCrossTenantWrites` bloqueia sobrescritas legadas.
- **Nuvem:** upsert escopado `onConflict('tenantid, id')` no `syncAssetsToCloud` + índice
  único composto no `docs/supabase_bootstrap.sql`; sanitização das cargas misturadas
  (CICOPAL × CLIENTETESTE) local e nuvem.
- **Login por contrato:** perfil do dono amarrado ao `tenantid` (semorr → CICOPAL) no
  `user_permissions` + metadata do auth; Barreira Local bloqueia admin/master sem
  contrato (resolve na nuvem antes); sync do dono não puxa mais todos os contratos.
- **RBAC:** `services/rbacService.ts` + `PermissionGate` nos submenus administrativos e
  de auditoria; matriz documentada em `docs/RBAC_GOVERNANCA.md`.
- **Provisionamento de licença:** `LicenseProvisioning` + `tenantProvisioningService` +
  `passwordPolicy` (senha forte validada) — criação de MASTER amarrado ao tenant; correção
  do erro 500 do signUp (`docs/supabase_signup_500_correcao.sql`).
- **Histórico de cargas:** `LoadHistoryScreen` (import/sync por contrato a partir do
  `audit_logs`); tool grid (AJUSTES/DADOS/PAINEL/AUDITORIA) movida para a tela de
  Unidade Operacional (`UnitSelector`) com navegação por painel via `NavigationParams.openPanel`.
- **Testes:** 295/295 (30 arquivos) — baseline do schema atualizado para `verno 7`;
  novos: `rbacService`, `tenantProvisioning`, `passwordPolicy`, `workContextUtils`,
  `routingTenantIsolation`, `postSelectionRouting`, `tenantContext`, `loadHistoryUtils`,
  `countAtivosByTenant`. Gate: `tsc -b --noEmit` ✓ · `vitest run` 295/295 ✓.

### Fase C — Padronização canônica de chaves/valores (UPPER → minúsculo)

Higienização completa do ecossistema para o canônico minúsculo (`endereco`, `etiqueta`, …),
eliminando a dupla grafia estrutural (D1) e a normalização assimétrica (D2) — sem DDL no
Supabase `public` (26/26 colunas canônicas) e com risco zero de perda de dados.

- **C1–C3:** helpers de normalização por classe (K/T/N/D/F) + `CANONICAL_KEY_MAP` + loader M1
  (3 caminhos) + coerções N/D/F (`normalizeNumeric`/`normalizeDateISO`/`normalizeFlag`).
- **M2:** varredura de ~700 chaves UPPER → canônico em ~40 arquivos (serviços, componentes, sync).
- **C4:** migração Dexie `version(5)` idempotente (`src/services/migrationV5.ts`) — reescreve
  chaves UPPER e normaliza valores com dry-run, flag `NORMALIZE_ON_UPGRADE` e reconcile
  aditivo de `addresses`; sync Supabase alinhado (`mapColumnName` verificado).
- **C5:** remoção da tolerância híbrida (leituras diretas canônicas), do bloco de fallback
  UPPER de escrita (`utils/schema.ts`) e varredura final (`pickCanonical` restrito a payloads
  não migrados: migração v5 e QR público).
- **Fixes SRE:** `findByEtiquetaInUnit` (ramo composto do `where()` agora filtra em memória)
  e `.eq('TAG_INVENTARIO')` realinhado ao contrato do `public` (`fetchCampaignStats`).
- **Testes:** 185 (novos `migrationV5`, `assetRepository.where`; baseline `schemaBaseline`
  atualizado para verno 5). Gate: `tsc -b --noEmit` ✓ · `vitest run` 185/185 ✓.

## [2.7.5] — 2026-11-16

### Summary

Correção da âncora da unidade operacional e da posição dos ativos. APK de campo
`gbr-kardek-v2.7.5-20261116.apk` (release `v2.7.5`, commit `8c09673`), assinado com a
chave fixa de `keystore/debug.keystore` — instala por cima do 2.7.4 sem desinstalar.

### GPS: a posição do ativo deixou de ser inventada

- `FIXAR ÂNCORA GPS` configura a **unidade**; a âncora não é copiada para os ativos.
- Bypass administrativo/offline deixou de gravar a âncora da unidade no ativo e de
  anunciar "POSIÇÃO FIXADA!" sem leitura real.
- `UnitConfigurator` abre sem coordenada (Brasília fica como centro visual do mapa).
- Portão único `persistableAssetGps` recusa bypass/âncora/zero/NaN antes de gravar GPS;
  o administrador lê o sensor como qualquer operador.
- A linha global do `inventory_config` já não zera a âncora da filial.

### Âncoras apagadas na nuvem não voltam pelo cache do aparelho

- `src/utils/revokedAnchors.ts` revoga **MATRIZ** e **010101 CICOPAL GO** pela chave
  *unidade + coordenada exacta* (tolerância 1e-6).
- `fetchUnitConfigs` filtra as revogadas e limpa o `local_unit_configs`;
  `collectGpsAnchorsFromStorage` ignora-as; `saveUnitConfig` recusa a coordenada revogada.
- Reposicionar a filial noutro ponto grava normalmente.

### `unit_configs` é a fonte canônica da âncora

- A linha de `unit_configs` vence o `inventory_config` quando tem coordenada real; o
  `inventory_config` fica como compatibilidade de leitura para APKs antigos.
- `saveUnitConfigFlags` deixou de escrever `lat: 0` numa gravação só de flags.

### Infra

- `versionCode` 20705.
- Removido o `android-build.yml` duplicado dentro do app (ignorado pelo GitHub, disparava
  APK em cada push); o workflow real continua sob demanda (Run workflow, tag `v*`, `/apk`).

### Gates

- `lint` · `tsc --noEmit` · `npm test` (88 ficheiros, 840 testes) · `npm run build` ·
  `check-docs` · `verify:governanca` — todos verdes.

## [2.6.0] — 2026-07-24

### Summary

Major stability release focusing on mobile boot reliability, authentication overhaul with MASTER DRIVE bypass, CI/CD pipeline with automated APK builds, and Dexie.js offline-first persistence.

### Highlights

#### 🚀 MASTER DRIVE — Super Admin Bypass

Users can now authenticate offline with the sovereign credential `Glaucio@1970` / `admin`, bypassing all local validation, SQLite, and Supabase checks. The bypass injects `gbr_admin_scope: GLOBAL_SUPER_ADMIN` and routes directly to the database manager screen.

- Fast credential check at the top of `handleSubmit` — early return guaranteed
- Session cleanup via `sessionStorage.clear()` before injecting admin scope
- `tenantId` set to `GBR_SUPER_ADMIN_CORINGA` for ecosystem-wide access
- Email `semorr@gmail.com` included in the master user profile for post-login routing

#### 🛡️ Boot Stability — No More Black Screen

Three-layer defense against black screen on mobile:

1. **Module-level `InitializeBootPipeline` removed** — previously removed the loader before React mounted. Now runs inside `useEffect` after React is safely mounted
2. **Global try/catch in `index.tsx`** — wraps `createRoot().render()` with a DOM fallback that shows the error and a "REINICIAR APP" button
3. **Init timeout reduced from 35s to 6s** — forces `setIsInitializing(false)` after 6 seconds, guaranteeing the login screen appears even if SQLite hangs

#### 🔐 Offline-First Authentication

Three-tier authentication pipeline:

1. **MASTER DRIVE** (sovereign bypass — `Glaucio@1970` / `admin`)
2. **Dexie.js / localforage lookup** (`localDb.users.get({ email })`) — searches persisted user profiles for offline login
3. **Supabase Cloud Auth** — falls through to cloud with network error detection; successfully authenticated cloud users are persisted locally for future offline access

#### 📱 PWA & CI/CD Improvements

- Android APK workflow with Gradle 8.11.1 and JDK 21
- Explicit Cache scoping to `Inventariador-main/` subdirectory
- PWA precache reconfigured: removed `.wasm` from glob to fix conflicting cache entries
- Service Worker now generates 23 precache entries (down from 24)
- Logo placeholder created in `/public/logo.png` to resolve manifest icon 404

### Features

- `feat(auth)`: MASTER DRIVE — sovereign credential bypass with GLOBAL_SUPER_ADMIN scope ([7d2975c])
- `feat(storage)`: `navigator.storage.persist()` — prevents OS from clearing IndexedDB ([c23b468])
- `feat(persistence)`: Dexie offline-first fallback across Dashboard, Consultation, AssetMap, AssetDetail ([fb1a4d1])
- `feat(ux)`: Loading skeleton states while Dexie queries run ([8d31465])
- `feat(ci)`: Android APK build workflow with dynamic versioning and caching ([8a0a5cc])

### Bug Fixes

- `fix(boot)`: Removed module-level `InitializeBootPipeline()` that removed loader before React mount ([f18a669])
- `fix(boot)`: Added global try/catch in `index.tsx` with DOM error fallback ([f18a669])
- `fix(boot)`: Reduced initialization timeout from 35s to 6s to guarantee login screen ([e7a2dee])
- `fix(boot)`: Fixed black screen after MASTER DRIVE — `LOAD_DATABASE` not in enum, replaced with `DATABASE_MANAGER` ([b54f954])
- `fix(boot)`: Added `.catch(() => 0)` to `countAtivos()` for fresh-install SQLite edge case ([4585782])
- `fix(auth)`: MASTER DRIVE credential changed from `semorr@gmail.com` to `Glaucio@1970` ([ee36aa2])
- `fix(auth)`: Added `email` field to masterUser for post-login routing ([f93d658])
- `fix(auth)`: Added validation console.log at start of `handleSubmit` for mobile diagnostics ([2baff0f])
- `fix(nav)`: Added `/auditor/selecionar-filial` to path mapping ([92a6dc9])
- `fix(ui)`: Replaced hardcoded `VERSÃO 2.6` with dynamic `pkg.version` ([c480ba1])
- `fix(ci)`: Upgraded JDK 17→21 and Gradle 8.11.1 for `bcprov-jdk18on` compatibility ([3d4662d])
- `fix(ci)`: Scoped Cache and Upload paths to `Inventariador-main/` subdirectory ([a92aadf])
- `fix(build)`: Fixed Motion imports for ESM compatibility ([d4517fe])
- `fix(pwa)`: Removed `.wasm` from glob patterns to fix conflicting cache entries ([2baff0f])
- `fix(cleanup)`: Removed ~48 lines of dead commented code (iFrame session injection) from App.tsx ([546eb96])
- `fix(observability)`: Replaced `console.error` with `logger.error` in InitializeBootPipeline for proper error capture in Capacitor WebView ([c508eee])

### Code Cleanup

- `refactor(login)`: Eliminated duplicated `normalizedUsername` declaration — outer scope variable used via closure ([d11b804])
- `chore(docs)`: Upgraded CHANGELOG to Keep a Changelog format ([0cd1a3a])

### Chores

- `chore(ci)`: Force-trigger build workflow ([8428dfb])
- `chore(ci)`: Remove stale nested workflow to avoid duplicates ([c6e0198])

### Dependencies Updated

| Package | From → To | Reason |
|---------|-----------|--------|
| `motion` | 10.16.4 → 11.11.17 | ESM import compatibility |
| `vite-plugin-pwa` | 0.17.4 → 0.19.0 | PWA generation fixes |
| `@capacitor-community/sqlite` | 5.x → 6.x | Native SQLite stability |
| `vite` | 5.0.11 → 5.1.4 | Build toolchain |

### Known Issues

- `logo.png` is a placeholder 1x1 red pixel — needs a proper 192x192 logo for PWA icons
- `sessionStorage.clear()` in MASTER DRIVE is aggressive — may remove boot flags set by other modules
- App may load slowly on first install due to IndexedDB initialization

### Upgrade Guide

1. Update to the latest APK from GitHub Actions
2. Login with the new sovereign credential: `Glaucio@1970` / `admin`
3. If experiencing black screen, wait up to 6 seconds for the forced login render
4. Clear browser/WebView cache if Service Worker conflict errors appear

[2.6.0]: https://github.com/semorrecualg/Inventariador/compare/f93d658...d11b804
