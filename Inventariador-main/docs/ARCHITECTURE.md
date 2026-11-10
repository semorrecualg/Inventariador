# GBR KARDEK – Inventariador · Documento de Arquitetura e Fluxos

> **Documento de referência** para todas as análises, correções e evoluções do projeto.
> Mantenha este arquivo atualizado sempre que a arquitetura mudar.
> Projeto: **GBR KARDEK – Inventariador v2.6.0** (inventário e auditoria de ativo imobilizado — GBR Auditoria).

---

## 1. Visão geral do produto e stack

PWA mobile-first para **auditoria física de ativos imobilizados em campo** (conferência com leitura de código de barras/QR, etiquetagem, assinatura eletrônica, georreferenciamento e relatórios), com **operação 100% offline** e empacotamento para Android via Capacitor.

| Camada | Tecnologia |
|---|---|
| UI | React 18 + TypeScript + Vite 5 + Tailwind CSS v4 + Motion + Lucide |
| Roteamento | React Router (`HashRouter`) — compatível com `file://` no Capacitor |
| Estado | React local no `App.tsx` (máquina de telas) + Zustand (`stores/`) |
| Persistência local | **Dexie.js (IndexedDB)** — banco `InventoryLocalStore` (tabelas em §7) |
| Nuvem (híbrida) | **Supabase** (Postgres multi-tenant, schema padronizado `tenantid` + `filial`) + Gemini (`@google/genai`) — ver §10 |
| Testes | Vitest (36 arquivos / 366 testes) — ver §13 |
| CI | GitHub Actions (APK Android) + PWA |

**Localização:** o app vive em `Inventariador-main/` (subdiretório do workspace; raiz do repo GitHub `semorrecualg/Inventariador`).

---

## 2. Estrutura de diretórios (`src/`)

```
src/
├── index.tsx               → Entry: ErrorBoundary + HashRouter + AppRouter (lazy App)
├── App.tsx                 → Monolito (~6.800 linhas): estado/navegação, auth, boot, rotas, DB
├── types.ts                → AppScreen (enum), DatabaseMode, User, NavigationParams…
├── router/
│   ├── AppRouter.tsx       → NavigationBridgeEffect (window.pushScreen → navigate) + Suspense
│   └── routes.tsx          → screenToPath: mapa AppScreen → URL
├── components/             → Telas e UI (Login, Modal, ModuleSelector, Inventory, Scanner…)
├── screens/                → Telas adicionais (separação parcial de telas pesadas)
├── services/               → Camada de dados/infra (ver §7)
├── stores/                 → Zustand: uiStore, authStore, inventoryStore, syncStore
├── hooks/                  → useLocalAuth, useBufferController
├── utils/                  → authUtils, routingUtils, logger, formatUtils…
├── constants/schema.ts     → Schema do banco local
└── __tests__/              → Suítes Vitest
```

---

## 3. Arquitetura de navegação — OS DOIS SISTEMAS (ponto crítico)

O app tem **duas fontes de verdade** de "onde estou" que precisam andar juntas:

### 3.1 Estado interno (máquina de telas)
- `history: AppScreen[]` + `screen` (useState no `App.tsx`).
- `pushScreen(s, params?)` é o **roteador canônico**: empilha telas, persiste em
  `localStorage['gbr_kardek_history']` / `app_screen_history`, e aplica guardas:
  - **SYNC_MANAGER** bloqueado em modo INTERNAL (abre modal "Recurso Indisponível").
  - **Barreira Canônica** (`validateAndPushRoute`): telas de inventário exigem
    `selectedUnit`; sem unidade, recua para `UNIT_SELECTION`.
  - `screen === LOGIN || MAIN_MENU` reseta o histórico (`setHistory([s])`).
- `AppScreen` (enum em `src/types.ts`) + mapa **`screenToPath`** (`router/routes.tsx`):
  `LOGIN→/login`, `MODULE_SELECTION→/modules`, `DATABASE_MANAGER→/db-manager`,
  `UNIT_SELECTION→/unit`, `INVENTORY→/inventory`, `DASHBOARD→/dashboard`, etc.

### 3.2 URL (HashRouter)
- Rotas explícitas: `/login` (renderiza `<Login/>`), `/menu` (renderiza `<MainMenu/>`).
- Rota catch-all `*`: renderiza o **shell** baseado em `screen` (estado interno).

### 3.3 O elo entre os dois (e o histórico de bugs)
- `AppRouter.tsx` registra um bridge: `window.pushScreen = (s) => { …; navigate(screenToPath[s]) }`.
- O `App.tsx` **sobrescreve** `window.pushScreen` com seu próprio `pushScreen`
  (lógica rica), que **não navegava a URL** → o router ficava preso na rota anterior.
- **Correção aplicada (ver §12):** efeito em `App.tsx` que sincroniza a URL:
  `useEffect(() => { …; window.location.hash = screenToPath[history[top]] }, [history])`.

> ⚠️ Regra de ouro: **qualquer mudança de tela deve passar por `pushScreen`/`setHistory`**
> e a URL deve refletir `screenToPath[screen]`. Nunca navegue só por URL nem só por estado.

---

## 4. Ciclo de boot

```
index.tsx
├─ registerSW (PWA) + appStarted=true (remove loader do index.html)
├─ try { createRoot().render(<ErrorBoundary><HashRouter><AppRouter/>…) } 
│    └─ catch → fallback DOM emergencial ("REINICIAR APP")
AppRouter → Suspense → lazy App.tsx
App.tsx
├─ InitializeBootPipeline()
└─ verificarEstadoEBoot():
    ├─ db.open() (IndexedDB/Dexie)
    ├─ se local_assets vazio → verifyAndRestorePhysicalBackup() (Capacitor .dat)
    │     └─ senão → FileSystemStorageService.carregarDeDiretorioLocal() (legado)
    ├─ Trava de Segurança Imperativa: força setHistory([LOGIN]) (ou [DATABASE_MANAGER] se purga recente)
    └─ catch → logger.error + setHistory([LOGIN])
```
- `isInitializing` com timeout de ~6s: garante que o Login renderize mesmo se o SQLite travar.
- O efeito `screen===LOGIN → hash '#/login'` garante Login no carregamento inicial (hash vazio).

---

## 5. Pipeline de autenticação — LOGIN POR CONTRATO (usuário × tenantid)

Arquivos: `components/Login.tsx` (handleSubmit), `utils/authUtils.ts`
(`isAdminEmail`, `localAuthenticate`), `App.tsx` (onLogin), `utils/workContextUtils.ts`
(`buildWorkContexts`/`persistWorkContext`).

```
1. BARREIRA LOCAL (offline-first)
   localAuthenticate / localDb.users / app_users (email + senha)
   ├─ admin/master SEM tenantid → resolve na nuvem (ensureUserProfile)
   │    └─ ainda vazio → LOGIN BLOQUEADO (nunca "GLOBAL")
   └─ com tenantid → onLogin(user) — contrato do registro local

2. SUPABASE CLOUD (quando online e databaseMode SUPABASE/PLUS)
   signInWithPassword → ensureUserProfile (user_permissions = fonte do contrato)
   ├─ downloadBaseToLocal: se base local vazia, baixa a do tenant (progresso %)
   ├─ persistência local do perfil p/ acesso offline posterior
   └─ onLogin(user) — tenantid 100% do perfil da nuvem

3. PÓS-LOGIN (App.tsx onLogin)
   multiContextLogin = buildWorkContexts(user) > 1 → Seletor de Contrato/Filial
   (TenantWorkSelector) → syncFromCloud(tenantid, mode, filial) — SÓ o contrato escolhido
```

**Regra de isolamento:** o app NUNCA opera sem contrato — cada usuário é amarrado a um
`tenantid` (`semorr@gmail.com` → `CICOPAL`; `master.teste@cliente.com` → `CLIENTETESTE`).
O "GLOBAL"/MASTER DRIVE foi **removido** (backdoor desativado). Provisionamento de novos
contratos: `LicenseProvisioning` + `tenantProvisioningService` (MASTER com senha forte
validada por `passwordPolicy`).

**Escopos de sessão (`sessionStorage`):** `gbr_admin_scope` ∈ `TENANT_MASTER` |
`OPERATIONAL_AUDITOR`; `tenantid`; `app_current_user`; `filial`.

---

## 6. Roteamento pós-login

`utils/routingUtils.ts` → `processarRoteamentoPosLoginSaas(profile, customNavigate)`:

| Condição | Rota | Tela |
|---|---|---|
| role DEMO | `/dashboard-demo` | DASHBOARD |
| role MASTER sem tenantid | **erro de consistência** | — |
| base vazia + admin | `/load-database` | **DATABASE_MANAGER** |
| base vazia + auditor | `/auditor/aguardando-carga` | MODULE_SELECTION |
| base cheia + admin | `/saas/painel-global` | **MODULE_SELECTION** |
| base cheia + MASTER | `/admin/painel-controle` | MODULE_SELECTION |
| base cheia + auditor | `/auditor/selecionar-filial` | UNIT_SELECTION |

`customNavigate` (App.tsx) converte path → `AppScreen` e chama `pushScreen`.
Guarda: `DATABASE_MANAGER` só para `isSuperAdmin` ou `semorr@gmail.com`.

---

## 7. Fluxo de dados OFFLINE (Dexie/IndexedDB + backups)

### 7.1 O "SQLite" local é Dexie/IndexedDB
Apesar do nome `sqliteService`, no browser/Web o motor é **Dexie sobre IndexedDB**:
- Banco: `InventoryLocalStore` (`class InventoryDexieDatabase`, versões 1→7 — **baseline
  congelado em `docs/SCHEMA_BASELINE.md`**, Fase 0 do plano de migração).
- `sqliteService = new Proxy({}, …)` — inicialização lazy.
- `getStorageSource()` → `'IndexedDB://InventoryLocalStore'` (no Capacitor nativo há
  caminho físico; em Web `persist()` é no-op).

**Tabelas (v7 canônica — snapshot congelado em `docs/SCHEMA_BASELINE.md`):**
| Tabela | Chave/índices |
|---|---|
| `local_assets`, `ativos`, `assets` (DexieAsset) | **`[tenantid+primarykey]`** (composta), `primarykey, filial, _is_synced, [tenantid+filial]` |
| `addresses` | `++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced` |
| `audit_logs` | `id, updated_at` |
| `campaigns` | `id, tenantid` |
| `SYSTEM_CONTEXT` | `key` |
| `unit_configs` | `id, filial` |
| `campaign_snapshots` | `id, campaign_id` |

### 7.2 Carga da base (DATABASE_MANAGER)
`services/DatabaseLoaderService.ts`:
`extrairDadosDaPlanilha(file)` → parse de **Excel (.xlsx/.csv)** →
`injetarDadosEmLotes(raw, onProgresso)` / `processExcelFile` / `importExcelBulkData`
→ grava em **lotes** via `db.transaction('rw', [ativos, assets, local_assets, …])`
(ACID, com progresso na UI — `DatabaseProgressBar`).

**Contrato do loader (planilha):** o arquivo deve ter **exatamente 21 colunas**, com nomes
E ordem fixas — `tenantid;filial;status;etiqueta;qt;descricaodoativo;serial;dataaqusic;cnpj;
nomefornecedor;notafiscal;endereco;registro;subreg;databaixa;contacontabil;primarykey;
centrodecusto;vlraquisic;sn1_recno;sn3_recno` — `tenantid` obrigatoriamente na **posição 0**.
A carga é **bloqueada** se o cabeçalho divergir (nome ou posição) ou se `tenantid` estiver
ausente/vazio. O `tenantid` vem **sempre da planilha** — nunca valor fixo em código.

### 7.3 Leitura/escrita operacional
- `localDbService.ts` (`localDb`): `saveLocalAsset`, `bulkSave`, `bulkPut` em chunks,
  `updateAsset`, `getLocationsWithStats(unitId, search)`, `clear`.
- `getLocationsWithStats` alimenta o `AddressSelector` (endereços indexados — sem table scan).
- `Inventory.tsx` filtra ativos por endereço/unidade e renderiza virtualizado (Virtuoso).
- Regras SRE do projeto: manipular dados **só via API Dexie** (proibido SQL raw); isolar por
  tenant (`[tenantid+filial]`); gravação bloqueada com bateria < 5% (`checkHardwareSafety`).

### 7.4 Backups físicos / sobrevivência
| Caminho | Mecanismo |
|---|---|
| Capacitor nativo | `GBR_KARDEK_DATA/local_assets_secure.dat` (`backupDatabaseToPhysicalStorage`) |
| Desktop Windows | File System Access API: `initializeWindowsDirectoryHandle`, `saveSnapshotToWorkspace`, `writeSnapshotToWindowsDirectory` |
| Boot (restauração) | `verifyAndRestorePhysicalBackup()` → repõe `local_assets` se IndexedDB zerado |

### 7.5 Sincronização em nuvem (ativa com credenciais)
`syncFromCloud` (App.tsx): push local primeiro → pull **escopado ao tenant**
(`fetchFullInventory(tenantid, unitid)` — `'TODAS'` = sem filtro de unidade; guards
bloqueiam sync sem tenant na tela de login). Upsert `onConflict('tenantid, id')` +
índice único composto `(tenantid, primarykey)` no `docs/supabase_bootstrap.sql`.
`syncService.ts`: fila de sync (assetId + photoBlob), `photoSyncManager`,
`processDataSyncQueue`, `addCampaignToSyncQueue`, `checkHardwareSafety`.
- **Modo INTERNAL (`isInternalMode=true`): nenhuma chamada de rede** (bloqueio no App.tsx).
- `navigator.storage.persist()` evita que o SO limpe o IndexedDB.

### 7.6 Schema Supabase (multi-tenant padronizado)
As **10 tabelas** da nuvem usam a coluna canônica `tenantid` (minúsculo):
`asset_logs`, `assets`, `audit_logs`, `campaign_snapshots`, `campaigns`,
`inventory_campaign_snapshots`, `inventory_campaigns`, `inventory_config`,
`unit_gps_data`, `user_permissions` — e **`filial`** substitui a legada `_unitid`
(`assets`, `inventory_config`, `unit_gps_data`, `user_permissions`).
Migrações aplicadas: `scripts/migrate-tenantid-supabase.sql` (rename das variantes
legadas para `tenantid`) e `scripts/migrate-unitid-supabase.sql` (drop de `_unitid`).

**Interceptor de colunas (`supabaseService.ts` → `mapColumnName`):** na borda do
Supabase, chaves legadas são mapeadas automaticamente — `_unitid`/`unit_id`/`unitid`
→ `filial` (em `assets`, `user_permissions`, `inventory_config`) e variantes de
tenant → `tenantid`. É **read-compat intencional**: não remover nem "corrigir".

---

## 8. Mapa de telas — esteira operacional de campo

```
LOGIN → MODULE_SELECTION → UNIT_SELECTION → ADDRESS_SELECTION → INVENTORY
        (Gestor de Base / Inventariador / Controle de Ativo)   (Scanner/Labeling/Signature)
```
- **Guardião atômico:** `DASHBOARD`, `ADDRESS_SELECTION`, `INVENTORY` exigem `selectedUnit`
  (não nulo) — interceptação na mutação do histórico força recuo para `UNIT_SELECTION`.
- `MODULE_SELECTION` limpa `selectedUnit` e suspende syncs ao retornar.

---

## 9. Chaves de estado/sessão (referência rápida)

| Chave | Onde | Uso |
|---|---|---|
| `gbr_kardek_history` | localStorage | Pilha de telas (canônica p/ roteamento) |
| `app_screen_history` | localStorage | Espelho da pilha |
| `app_screen_params` | localStorage | Params da navegação |
| `app_current_user` | sessionStorage | Usuário logado (JSON) |
| `gbr_admin_scope` | sessionStorage | TENANT_MASTER / OPERATIONAL_AUDITOR (MASTER DRIVE removido) |
| `tenantid`, `filial` | sessionStorage | Contexto do tenant/unidade (`tenantId` legado lido como fallback via `tenantUtils`) |
| `current_selected_address` | sessionStorage | Endereço físico selecionado (anchor do inventário) |

---

## 10. Env vars e modos de banco

| Variável | Uso | Obrigatória? |
|---|---|---|
| `GEMINI_API_KEY` | Insights AI (`geminiService`) — lida via `process.env` | não (desliga o recurso) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_SCHEMA` | Cloud mode (`SUPABASE_PLUS`) — schema multi-tenant padronizado | não |
| `VITE_ADMIN_EMAIL` | Override do e-mail admin (default `semorr@gmail.com`) | não |
| `APP_URL` / `SHARED_APP_URL` | `vite.config.ts` `define` | não |
| `VITE_API_URL` | `vercel.json` (deploy) | não |

`DatabaseMode`: `INTERNAL` · `INTERNAL_PLUS` · `SUPABASE` · `SUPABASE_PLUS`.
`isInternalMode = !(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)`: sem credenciais →
**INTERNAL** (sem rede, offline puro); com credenciais → **SUPABASE** (Web/Desktop),
schema multi-tenant padronizado (`tenantid` + `filial`) e login por contrato.

### 10.1 Fluxo build-time → `isInternalMode` (credencial → modo → rede)

`VITE_*` **não são lidas em runtime**. O Vite substitui cada `import.meta.env.VITE_*`
literalmente no bundle durante o `build`, portanto a credencial fica **congelada dentro do
`dist/` e, por consequência, dentro do APK**. É esta cadeia que os workflows controlam:

```
GitHub → Settings → Secrets and variables → Actions
   VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY
         │  (o expression engine do Actions resolve ${{ secrets.NOME }})
         ▼
env do job (android-build.yml)  /  env do passo "Build de produção" (ci.yml)
         ▼
vite build  →  substitui import.meta.env.VITE_*  (VITE_ADMIN_EMAIL idem)
         ▼
dist/assets/App-<hash>.js      ← credencial congelada no bundle
         ▼  npx cap sync android
android/app/src/main/assets/public/…
         ▼  ./gradlew assembleDebug
APK gbr-kardek-v<versão do package.json>-<data>.apk
```

No arranque da app, `services/supabaseService.ts` avalia **uma vez** (nível de módulo):

```
sanitizeCredential(url | key)     trim + remove aspas acidentais
normalizeSupabaseUrl(url)         exige http/https e hostname com ponto; inválido → ''
isInternalMode = !(url && key)
   true  → cliente Supabase com placeholders inofensivos; ZERO rede (INTERNAL)
   false → cliente real; databaseMode default SUPABASE_PLUS
```

A normalização existe porque `createClient('<valor inválido>')` lança `Invalid supabaseUrl`
**no load do módulo** — antes de qualquer error boundary útil — e derruba a app inteira
(ecrã "OPS! ALGO DEU ERRADO"). URL presente mas inutilizável conta como **ausente**:
cai para INTERNAL em vez de rebentar.

**Onde o modo é consumido** (contrato: a credencial decide o modo, o modo decide a rede):

| Local | Efeito |
|---|---|
| `App.tsx` — init de `databaseMode` | `localStorage['app_database_mode']` ou `isInternalMode ? INTERNAL : SUPABASE_PLUS` |
| `App.tsx` — guards de sync | `if (mode === INTERNAL \|\| isInternalMode) return` (nenhuma chamada de rede) |
| `App.tsx` — Base Oficial | modal "build não compilado com as chaves" e recusa de abertura |
| `components/Login.tsx` — badge | `AMBIENTE: MOBILE (LOCAL)` (âmbar) vs `SUPABASE (WEB)` (verde) |
| `screens/DatabaseManagerScreen.tsx` | botão de espelhamento para a nuvem `disabled` em INTERNAL |

**Modos de falha da credencial** (diagnóstico rápido):

| Causa | Sintoma | Onde se vê |
|---|---|---|
| Secret não cadastrado | `::error::Secret(s) ausente(s): …` e job falha | passo *Validar credenciais* (`android-build.yml`) |
| Secret presente mas malformado | `::warning::VITE_SUPABASE_URL não é um URL http(s) válido`; APK abre em INTERNAL | idem + anotações da run |
| Valor **colado dentro** de `${{ … }}` | workflow inteiro inválido: a run falha em segundos e aparece com o caminho (`.github/workflows/…`) em vez do `name:` — nada corre | lista de runs do Actions |
| Credencial válida | `Credenciais do Supabase presentes (URL e chave publica).` sem warnings | passo *Validar credenciais* |

`${{ … }}` só aceita contexto (`secrets.`, `vars.`, `github.`, `env.`, `runner.`) e operadores.
No YAML entra apenas o **nome** do secret; o valor vive em Settings (§5 da governança).

**Rodar a chave obriga a reconstruir.** Como a substituição é estática, o APK já publicado
mantém a chave antiga e passa a falhar a autenticação (`Invalid API key`) ou cai para
INTERNAL. Caminhos de rebuild, por ordem de preferência:

1. **Re-run all jobs** na run do *Build Android APK* — os secrets são lidos no momento da
   execução, logo o APK novo sai com o valor atualizado, sem commit novo;
2. `push` para `main` (qualquer commit) ou `workflow_dispatch` no Actions.

**Como provar que a credencial entrou no APK** (sem imprimir valores):

```bash
gh run download <run_id> -n gbr-kardek-apk -D .tmp
unzip -o -q .tmp/*.apk 'assets/public/assets/*' -d .tmp/x
grep -rlo 'mpulmonxbcpqjxouzvuc.supabase.co' .tmp/x   # host inlined no bundle
gh api /repos/semorrecualg/Inventariador/check-runs/<job_id>/annotations \
  --jq '.[] | "\(.annotation_level): \(.message)"'          # sem ::warning:: de URL malformada
```

O `iat` do JWT inlined no bundle também serve para confirmar rotação de chave (data de
emissão posterior à rotação), sem revelar o valor.

---

## 11. Guia de análise e correção (checklist SRE)

1. **Leia** este documento + `docs/COMPONENTS_MAP.md` + `SYSTEM_INSTRUCTIONS.md` (governança do repo).
2. **Entenda o fluxo afetado**: suba pela cadeia
   `LOGIN → MODULE_SELECTION → UNIT_SELECTION → DASHBOARD/ADDRESS → INVENTORY`.
3. **Navegação**: confira se a mudança passa por `pushScreen`/`setHistory` e se a URL
   (`screenToPath`) é sincronizada (efeito em `App.tsx`).
4. **Dados**: use sempre a API Dexie (`localDb`/`sqliteService`) — sem SQL raw; respeite
   isolamento por tenant (`[tenantid+filial]` — helpers em `utils/tenantUtils.ts`);
   alterações de schema local = nova `version(n)` no Dexie; alterações no Supabase via
   `scripts/migrate-*-supabase.sql`.
5. **Valide**: `npx tsc --noEmit` (zero erros em `src/`) + `npx vitest run` (366 testes).
6. **Reproduza** no navegador (Playwright headless) quando o bug for de fluxo/UI.

---

## 12. Correções aplicadas nesta sessão (base para próximas análises)

1. **Tela em branco no boot (hash vazio `#/`)** — catch-all sem caso para `LOGIN`.
   → efeito `screen===LOGIN` força `#/login`. ✅ verificado no navegador.
2. **Login "sem erro, sem avanço"** — URL presa em `#/login` porque o `pushScreen`
   interno não navegava a URL (o bridge do `AppRouter` era sobrescrito).
   → efeito `[history]` sincroniza `window.location.hash = screenToPath[top]`. ✅ verificado:
   com o login do admin (VITE_ADMIN_EMAIL) o app avança para `#/modules` (MODULE_SELECTION).
3. **Testes** — devDeps adicionadas (`jsdom`, `@testing-library/react`, `@testing-library/dom`);
   corrigidos `Modal.test.tsx`, `ErrorBoundary.test.tsx`, `useBufferController.test.tsx`
   → **103/103 verdes**.
4. **Schema multi-tenant padronizado** — coluna canônica **`tenantid`** (minúsculo) em todas
   as tabelas e **`filial`** substituindo a legada `_unitid` (zero escritas de `_unitid` em
   `src/`). Helper central `utils/tenantUtils.ts` (`resolveTenantId`, `readLocalTenantId`,
   `readSessionTenantId`) com leitura retroativa das chaves legadas (`tenantId`, `_tenantid`,
   `tenant_id`). Migrações SQL versionadas: `scripts/migrate-tenantid-supabase.sql` e
   `scripts/migrate-unitid-supabase.sql`. Interceptor `mapColumnName` no
   `supabaseService` mapeia chaves legadas na borda do Supabase (read-compat
   intencional — ver §7.6). → typecheck limpo + **144/144 testes verdes** (13 arquivos).
5. **Mapa de navegação consolidado (docs/FLOW_GRAPH.md)** — os **32 nós** do grafo de
   negócio mapeados para `AppScreen`; removidas 2 telas órfãs (`SETTINGS`, `QR_CONFIGURATOR`)
   que colidiam com rotas vivas (`/sync`, `/qr-config`). Decisões de transição registradas:
   ONBOARDING → `MODULE_SELECTION` (não `DASHBOARD` — guarda da Barreira Canônica),
   CHANGE_PWD → `UNIT_SELECTION` com desvio para `MAIN_MENU` em base vazia + admin.
   Novo teste de contrato `navigationMap.test.ts` garante rota única por tela e zero órfãs.

---

## 13. Testes (Vitest)

`npx vitest run` (script `npm test`). Suítes em `src/__tests__/`:
`Login`, `localAuth`, `ErrorBoundary`, `Modal`, `useBufferController`, `io_buffer`,
`tenantUtils`, `navigationMap`, `virtualSnapshot`, `schemaBaseline`, `securityExport`,
`rbacService`, `tenantProvisioning`, `passwordPolicy`, `workContextUtils`,
`routingTenantIsolation`, `postSelectionRouting`, `tenantContext`, `loadHistoryUtils`,
`countAtivosByTenant` (30 arquivos / 295 testes).
- Ambiente `node` default; arquivos com `@vitest-environment jsdom` usam jsdom.
- E2E: `npm run test:e2e` (Playwright) — ainda não configurado com browsers neste workspace.

---

## 14. Pendências conhecidas

- **Typecheck limpo ✅ (Fase 0, pendência 1 da issue #6 — concluída 2026-08-06):** a dívida
  pré-existente (`workbox-core` `ExtendableEvent`, `rollup` `parseAst`,
  `@tailwindcss/vite`, `vite-plugin-pwa`/`@vite-pwa/assets-generator`, TS6310 de projeto
  referenciado) não reproduz mais — `tsconfig.json` único com `skipLibCheck: true` e sem
  `references`, mais declarações ambient `src/types/workbox.d.ts` +
  `src/types/pwa-assets-generator.d.ts`. Verificado: `tsc -b --force` e `tsc --noEmit -p` → zero erros.
- `public/logo.png` é placeholder 1×1 — gerar ícones PWA reais.
- Nuvem Supabase **ativa** com schema padronizado (`tenantid` + `filial`) — índice único
  composto `(tenantid, primarykey)` e upsert `onConflict('tenantid, id')` aplicados;
  migrações em `scripts/migrate-*-supabase.sql` + `docs/supabase_bootstrap.sql`.
- Muro multi-tenant local: chave composta `[tenantid+primarykey]` (v6→v7) + guard
  `filterCrossTenantWrites` — validado com coexistência de contratos no mesmo device.
- Login por contrato: perfil do dono amarrado ao `tenantid` (user_permissions + metadata
  do auth); Barreira Local bloqueia admin sem contrato.
- Provisionamento MASTER: `LicenseProvisioning`/`tenantProvisioningService` com senha
  forte (`passwordPolicy`) — validar fluxo completo ponta a ponta no device.
- Fluxo "base vazia": admin cai no Gestor de Base — validar carga de `.db`/Excel.

Rastreamento público: **GitHub Issue #6** (`semorrecualg/Inventariador`).

### Roadmap de dados (decisão aprovada)

**Arquitetura Híbrida aprovada:** Web/PWA mantém **Dexie/IndexedDB**, Android (Capacitor)
passa a **SQLite nativo** (`@capacitor-community/sqlite`, deps já instalados) e o **Supabase**
(Postgres) é o sistema de registro com sync bidirecional — integração em `supabaseService.ts`,
**schema multi-tenant já padronizado** (`tenantid` + `filial`) com migrações versionadas em
`scripts/` (ver §12 item 4).

Plano completo em fases (0–5, com garantias anti-perda, riscos e critérios de aceite):
**→ `docs/MIGRACAO_HIBRIDA.md`** · rastreamento operacional: **GitHub Issue** (nova, vinculada a esta).

---

## 15. Referências internas

- `docs/COMPONENTS_MAP.md` — mapa mestre de navegação e dependências dos componentes.
- `SYSTEM_INSTRUCTIONS.md` — governança SRE do repositório (regras de roteamento, persistência).
- `SKILL.md` — skill de release (changelog/versão/GitHub release).
- `CHANGELOG.md` — histórico de versões (v2.6.0: MASTER DRIVE, boot estável, offline-first).
- `TROUBLESHOOTING.md` — problemas conhecidos e instalação (`--legacy-peer-deps`).
- `docs/SCHEMA_BASELINE.md` — **snapshot congelado do schema local** (Fase 0, v7 `[tenantid+primarykey]`), garantido por `src/__tests__/schemaBaseline.test.ts`.
- `docs/RBAC_GOVERNANCA.md` — **matriz de papéis e rotinas RBAC** (Trilhas A/B/C + PermissionGate).
- `docs/MIGRACAO_HIBRIDA.md` — **plano aprovado de migração híbrida de dados** (Dexie + SQLite
  nativo Android + Supabase), fases 0–5 com garantias anti-perda.
- `docs/FLOW_GRAPH.md` — **mapa canônico de navegação** (GRAPH TD) com status por nó e
  decisões de transição; validado por `src/__tests__/navigationMap.test.ts`.
