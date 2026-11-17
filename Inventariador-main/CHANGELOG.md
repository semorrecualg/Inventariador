# Changelog

All notable changes to the GBR KARDEK Inventariador project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Cadastro de acessos — filiais do contrato lidas também da nuvem

- **Lista de filiais sem beco sem saída:** o modal de novo/editar acesso só
  lia as filiais da base local em disco e mostrava "nenhuma filial na base"
  mesmo quando o contrato tem filiais publicadas na nuvem (aparelho novo, base
  ainda não baixada). O modal passa a consultar `fetchUnitNamesFromCloud` (só a
  coluna `filial`, sem baixar ativos) e a fundir as filiais da nuvem com a base
  local e as unidades já atribuídas a perfis do contrato.
- **Mensagem honesta:** enquanto a consulta corre a lista indica "A procurar
  filiais na nuvem..." e o vazio passa a dizer "Nenhuma filial encontrada",
  em vez de afirmar que não existe filial na base.

### Poda de papéis RBAC — GESTOR excluído, AUXILIARY_AUDITOR fundido em AUDITOR

- **Papéis vivos:** `ADMIN`, `MASTER`, `AUDITOR` e `USER`, mais os fluxos de
  licença `DEMO`/`MOBILE_SINGLE`. `GESTOR` (nunca atribuível, só tratado por
  comparação de string) e `AUXILIARY_AUDITOR` saem do enum `UserRole` e do
  seletor da tela de Acessos.
- **Sem perda de acesso:** `docs/supabase_migracao_papeis_legados.sql` remapeia
  `GESTOR → ADMIN` e `AUXILIARY_AUDITOR → AUDITOR` em `user_permissions`; o
  cliente lê a grafia legada `AUXILIARY_AUDITOR` como `AUDITOR`
  (`src/utils/roles.ts`) até o dispositivo sincronizar.
- **Gates inline:** GPS/geocerca, filiais e rotas deixam de listar papéis por
  string e passam por `canonicalRole`/`isFieldAuditorRole`.
- **Testes:** matriz RBAC, escopo de unidades e contexto de trabalho atualizados
  — o papel legado continua a ser lido como auditor e `GESTOR` já não concede
  governança.

### Carga sem perda de registos e campanha como chave de controlo da filial

- **Carga literal e reconciliada:** a planilha entra copiada campo a campo
  (`_sourceRow`), com datas/valores também tipados, e a carga termina exigindo
  `planilha N = base N` por filial — se uma chave repetida substituir outra linha,
  a carga bloqueia em vez de reportar sucesso.
- **Identidade interna do ativo (Fase 2):** `primarykey`/`id` passam a ser uma
  chave interna derivada (chave de origem única → chave canónica; chave repetida →
  derivada de chave + conteúdo), com a `primarykey` da planilha preservada em
  `source_primarykey` e a proveniência em `source_row`/`import_batch`. Nenhuma
  linha é descartada e reimportar o mesmo arquivo não duplica nem perde registos.
- **Campanha = controlo do inventário (Fase 1):** campanha exige filial, só uma
  campanha aberta (`CREATED`/`ACTIVE`) por filial e por contrato — campanha sem
  `tenantid` não bloqueia a de outro contrato —, e campanha com ativos lidos não
  pode ser excluída. A guarda corre nos serviços (vale offline) e o SQL ganhou
  `CHECK` de filial e índice único parcial na migração da Fase 1.

### Remoção da integração Gemini (código morto e chave exposta ao cliente)

- Saem o serviço de IA, o assistente, o modal de chat e o cartão de insight (este
  último sem uso), junto com a dependência `@google/genai` e o selo «AI» do cabeçalho
  que lia a chave da IA no cliente.
- A chave sai do `.env.example`, do `metadata.json` (`majorCapabilities`) e da
  documentação (README, ARCHITECTURE, SPEC, GOVERNANCA); o painel de desempenho global
  deixa de pedir insights por IA. Os tokens `ai-start`/`ai-end` e a classe
  `.ai-gradient` saem do `index.css` por ficarem sem consumidores.

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

## [2.8.0] — 2026-11-17

### Versionador único: a versão do app em todas as telas, lida do `package.json`

- **Fonte única:** `utils/appVersion.ts` expõe `APP_VERSION`,
  `APP_VERSION_LABEL` (`v2.8.0`) e `APP_VERSION_STAMP` (`GBR v2.8.0`) a partir do
  `package.json` — o mesmo número que o APK (`android-build.yml`) e o protocolo
  do SRE usam. `sreProtocol` passa a importar daqui; um bump de versão atualiza
  todas as telas de uma vez, sem cópia paralela.
- **Selo global automático:** `AppVersionStamp` é montado no router e aparece em
  todas as telas, no mesmo formato e na mesma posição, sem interceptar toques e
  sem ficar por cima dos modais (z-index abaixo de `z-[20000]`). Quando a tela
  tem barra de ação fixa no rodapé (configuradores, seletores, detalhe do ativo),
  o selo sobe acima dela — deixa de cobrir o botão `Aplicar`.
- **Telas ligadas ao versionador:** `App`, `Login`, `Consultation` e o Gestor de
  Base deixam de importar o `package.json` directamente e passam a ler a versão
  (e a etiqueta) de `utils/appVersion`, incluindo o cabeçalho do pacote de
  diagnóstico.
- **Versões chumbadas removidas:** `Protocolo v24.40`, `Field Guard v24.40`,
  `Aplicar v24.40`, `QR Guard v24.40`, `v24.50.2`, `KARDEX DIGITAL v24.50.3`,
  `GBR Auditoria Patrimonial v24.50 Expert`, `Protocolo de Inventário GBR v24`
  (PDF de assinatura), o Manual do Sistema (`v2.6` e `24.50.03`) e as legendas do
  centro de privacidade e da paleta passam a mostrar a versão do build.

## [2.7.9] — 2026-11-17

### Exportações do Gestor de Base deixam de mostrar o tenantid cru

- **Relatório de recno (CSV):** a coluna `tenantid` sai mascarada (`CICOPAL` →
  `CI***`), como já acontecia no pacote de diagnóstico; filial, recno, etiqueta e
  valor continuam legíveis para a conferência no Protheus.
- **Relatório de cópias (`[DEDUP]`):** a identidade do exemplo
  (`tenantid|filial|etiqueta`) leva o mesmo tratamento — o contrato sai mascarado
  e filial/etiqueta ficam legíveis para dizer qual caminho gravou a cópia.
- **`redactTenantId` em `utils/diagnosticRedaction`:** a máscara de um
  identificador isolado (coluna de CSV, chave de relatório) passa a ter função
  própria, com a normalização da base (trim + maiúsculas).
- **Prova disto mesmo:** a linha de base F0 continua a ser JSON válido depois de
  redigida (`tenantid` → `CI***`, restantes campos intactos) e o CSV de recno tem
  teste a exigir `CI***` na coluna do contrato.

## [2.7.8] — 2026-11-17

### Relatório de cópias deixa de contar linhas sem etiqueta como identidades

- **Duas contas no `[DEDUP]`:** o diagnóstico do Gestor de Base passa a mostrar
  `identidades distintas` (`tenantid + filial + etiqueta`) numa linha e, noutra,
  as `linhas sem etiqueta`, que ficam fora do agrupamento e entram uma a uma na
  projeção de linhas. Antes o total de linhas (11 832) era apresentado como se
  todas fossem identidades — são 11 437 identidades + 395 sem etiqueta.
- **Sem alteração de dados:** continua a ser leitura pura; nenhum registo é
  apagado e a contagem de cópias não muda.

## [2.7.7] — 2026-11-17

### Protocolo SRE com versão fixa e placar das duas bases

- **Versão na primeira linha:** o Gestor de Base de Dados abre com
  `INVENTARIADOR v2.7.7 · SRE · GESTOR DE BASE DE DADOS` na tela e no terminal
  SRE; a mesma linha vai à frente do log copiado e do pacote de diagnóstico
  exportado, para que chat e ticket identifiquem sempre o build.
- **Placar LOCAL × SUPABASE (online):** um cartão mostra o total de registos do
  contrato no aparelho e o total lido agora na tabela `assets` da Nuvem
  (`count: exact`, só leitura), com estado `ONLINE`/`OFFLINE`/`NÃO CONFIGURADO`.
  O botão `ATUALIZAR` repete a consulta; nada é enviado, alterado ou apagado, e
  os dois totais seguem também no log copiado e no pacote `.md`.

## [2.7.6] — 2026-11-17

### Envio à nuvem deixa de recusar etiquetas repetidas da planilha

- **Guarda por registo, não por identidade:** a tabela `assets` guarda uma linha
  por `(tenantid, primarykey)`. Duas linhas da planilha com a mesma etiqueta
  (`tenantid + filial + etiqueta`) são registos distintos e passam a subir as
  duas; o bloqueio fica reservado ao MESMO registo repetido no payload, que o
  upsert por `(tenantid, id)` não consegue gravar (ON CONFLICT ... cannot affect
  row a second time).
- **Identidade repetida vira diagnóstico:** o Gestor de Base continua a mostrar
  quantas linhas partilham a etiqueta e o terminal avisa uma vez, mas o envio
  segue — exigir "limpar cópias" era pedir para apagar registos.
- **Identidade já presente na nuvem com outro `primarykey`** deixa de recusar o
  lote (passa a aviso): a segunda linha legítima da planilha chegava depois da
  primeira e ficava bloqueada.

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

## [2.7.4] — 2026-11-12

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Fecha a contagem lenta das unidades, devolve a conferência à fila da nuvem, permite escolher
a âncora no mapa por clique/arrasto e sanea o espelho local de ativos.

### Unidades e conferência

- #50–#52 — contagem de ativos por unidade numa só passagem; lista de filiais presa ao
  utilizador e ao contrato; carga inicial exige a filial e nunca baixa o contrato inteiro.
- `_is_synced` zerado no ponto único de gravação; delta aceita o checkpoint do contrato como piso da filial; o selo
  "Sincronizado" só aparece em ativo conferido.
- Envio da conferência do aparelho religado ao Supabase; variações do rótulo da unidade
  aceitas e descarte de pendentes auditado.

### Inventário

- Rótulo `RAD` único por unidade e aparelho, com contador; registro adotado ganha identidade
  `rad_NNNNNN` e `subreg`.
- Cópia para item novo usa lista branca e `rad_recno`; "não localizado" copia os dados em vez
  de adotar outra unidade.
- Lote por plaqueta ou registro num só modal; lote manual renomeado para seleção manual e
  passa a exigir endereço.
- Módulo INVENTARIADOR travado em unidade não liberada.

### Base e ativos

- Chave canônica única em todos os caminhos de escrita, com guardião suave de duplicidade por
  `sn1_recno` do Protheus.
- Limpeza de cópias repetidas por contrato, filial e etiqueta, com registro em auditoria e
  recálculo da unidade.
- Gestor de Base: relatório de recno separado e exportação em CSV.

### Mapa e GPS

- #58 e #59 — âncora escolhida por clique e arrasto no mapa.

### Modo de base e campanhas

- Um único `getDatabaseMode` como resolver do modo, usado por campanhas, snapshots, fila de
  fotos e `updateCampaignStatus`.
- Exclusão de campanha deixa de "não fazer nada" e a permissão fica unificada no cartão e na
  ficha; laudo sempre gravado no aparelho, com leitura de fallback local.

## [2.7.3] — 2026-11-09

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Ficha do ativo, etiquetagem e tags de auditoria; cabeçalho do inventário com telemetria;
sincronização em lotes paralelos.

- `#32` — liberação da unidade lê a campanha do banco persistido.
- `#33`/`#34` — documentação: migração das colunas de `tenant` para `tenantid` e fluxograma do
  login na nuvem e download da base.
- `#35`/`#36` — tags de auditoria, lista dos ativos do endereço, ficha do ativo consolidada e
  etiquetagem.
- `#37` — ativo localizado pela busca de patrimônio.
- `#38` — painel único de preferências do inventário.
- `#39` — busca por foto removida (sem assets de OCR).
- `#40`–`#43` — telemetria no cabeçalho em marquee, endereço numa linha, confirmação em barra
  na base do card e endereço/progresso acima da barra de busca.
- `#44` — sincronização em lotes paralelos, com a fila de nuvem fora do caminho visual.
- `#45`/`#46` — espelhamento adaptado ao `id` uuid do schema remoto; Gestor de Base conta os
  três espelhos locais e limpa o espelho virtual.
- `#47` — correções da unidade operacional, da configuração e do APK.
- `#48` — conferência em lote volta a ficar pendente de nuvem até subir.
- `#49` — testes do `syncConfigToCloud` deixam de depender das credenciais do ambiente.

## [2.7.2] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

O build do APK passa a falhar em vez de publicar um APK inútil.

- `#29` — o build falha quando a URL do Supabase é inutilizável.
- `#30` — o build falha quando a credencial não fica embutida no APK.
- `#31` — versão para 2.7.2.

## [2.7.1] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`; a versão não teve tag nem release.

### Summary

Contrato de trabalho único (base, filial, auditor) e assinatura estável do APK.

- `#19` — o contrato vem da base e libera o dono global.
- `#20` — carga de planilha passa a operar na base local.
- `#21` — saída para o Gestor de Base quando não há contrato.
- `#22` — coluna `filial` exibida exactamente como veio da planilha.
- `#23` — auditor criado com contrato e filial, mantendo a sessão.
- `#24`/`#26`/`#27` — a mesma chave de assinatura em todos os builds: keystore criado antes do
  build, fixo e verificado (sem ele o Android recusa a instalação por cima).
- `#28` — contrato de trabalho único, liberação por âncora/campanha e admin; sobe a versão
  para 2.7.1.

## [2.7.0] — 2026-11-08

> Entrada reconstruída a partir dos squashes em `main`. Foi a primeira versão 2.7 e a única
> da série com tag e release até à 2.7.5.

### Summary

Primeira versão da série 2.7: CI e APK confiáveis, boot e autenticação estáveis, e a
documentação de arquitetura que os builds seguintes usaram. O período entre a 2.6.0 e esta
versão tem 137 commits, boa parte aplicada directamente em `main` — os PRs abaixo são os que
ficaram registados como squash.

- `#9` — admin email e URL do Supabase no workflow.
- `#11` — `AGENTS.md` com a regra de entrega no GitHub.
- `#12`/`#15` — correcção dos nomes e da sintaxe de secrets nos workflows.
- `#13` — o APK deixa de crashar quando a URL do Supabase está malformada.
- `#14` — chip CAMPANHA ao activar em modo offline.
- `#16` — documentação do fluxo build-time até `isInternalMode`.
- `#17` — o build falha quando faltam as credenciais do Supabase.
- `#18` — versão para 2.7.0.
- Trabalho directo em `main` no mesmo período: hardening do workflow Android (Java 21 e
  Gradle 8.11), remoção do `android-build.yml` duplicado dentro do app (`c6e0198`), auto-flush
  no `useBufferController` e correcções de boot/login/imports.

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
