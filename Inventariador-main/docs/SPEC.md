# GBR KARDEK – Inventariador · Especificação do Projeto (SPEC)

> **Versão do documento:** 1.0 · **App:** v2.6.0 · **Repositório:** `semorrecualg/Inventariador`
> **Objetivo:** especificação canônica (o quê, para quem, como funciona, stack, dados,
> auth, fluxos, ambiente, testes e roadmap). Complementa `docs/ARCHITECTURE.md`
> (como o sistema é construído por dentro) e `docs/MIGRACAO_HIBRIDA.md` (plano de dados).

---

## 1. Resumo executivo

**Inventariador (GBR KARDEK)** é um PWA mobile-first para **auditoria física de ativos
imobilizados em campo**: o auditor confere patrimônio lendo código de barras/QR (com OCR
como fallback), etiqueta itens faltantes, captura assinatura eletrônica, georreferencia
ativos em mapa e gera relatórios — **offline-first** (Dexie/IndexedDB) com empacotamento
Android via Capacitor e **sincronização multi-tenant em nuvem (Supabase) ativa** quando as
credenciais `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` estão presentes.

- **Domínio:** GBR Auditoria (controle patrimonial / inventário físico de ativo imobilizado).
- **Público:** auditores de campo, gestores de base e administradores (multi-tenant por contrato e filial).
- **Modo de operação atual:** `SUPABASE` (Web/Desktop com credenciais) · `INTERNAL` (offline-first, sem rede — build sem credenciais).

---

## 2. Stack tecnológica

| Camada | Tecnologia | Observação |
|---|---|---|
| UI | React 18 + TypeScript + Vite 5 | Build toolchain |
| Estilo | Tailwind CSS v4 + Motion + Lucide | `@tailwindcss/vite` |
| Roteamento | React Router `HashRouter` | Compatível com `file://` no Capacitor |
| Estado | State local em `App.tsx` (máquina de telas) + Zustand (`stores/`) | `uiStore`, `authStore`, `inventoryStore`, `syncStore` |
| Persistência local | **Dexie.js / IndexedDB** — banco `InventoryLocalStore` | Schema **v7** (chave composta `[tenantid+primarykey]` — baseline em `docs/SCHEMA_BASELINE.md`) |
| Nuvem (ativa) | Supabase (`@supabase/supabase-js`) + Gemini (`@google/genai`) | Multi-tenant (`tenantid` + `filial`); `isInternalMode = !(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)` |
| Mobile | Capacitor 6 (Android) | APK via GitHub Actions |
| Banco nativo Android (fase 3) | `@capacitor-community/sqlite` + `jeep-sqlite` + `sql.js` | Instalados, ainda não usados |
| Testes | Vitest (30 arquivos / 295 testes) + Playwright (E2E) | `npm test`, `npm run test:e2e` |
| Qualidade | ESLint + TypeScript + Husky | `npm run lint` |

**Dependências principais:** react, react-dom, dexie, @supabase/supabase-js, @google/genai,
@capacitor/*, maplibre-gl, @turf/turf, xlsx, jspdf, tesseract.js, html5-qrcode,
react-signature-canvas, react-virtuoso, recharts, zustand, motion, lucide-react.

---

## 3. Requisitos funcionais

### 3.1 Autenticação — login por contrato (usuário × tenantid)
1. **Barreira Local (offline-first):** autentica contra `localDb.users`/`app_users` e, se o
   perfil for admin/master **sem** `tenantid`, resolve o contrato na nuvem (`ensureUserProfile`)
   — se continuar vazio, o login é **bloqueado** (nunca "GLOBAL").
2. **Supabase Cloud:** `signInWithPassword` → perfil `user_permissions` (fonte da verdade
   do contrato) → persistência local para acesso offline posterior; `downloadBaseToLocal`
   baixa a base do tenant quando o dispositivo está vazio.

**Regra de isolamento:** todo usuário é amarrado a UM `tenantid`; o app carrega e exibe
somente os dados do contrato do usuário logado (ex.: `semorr@gmail.com` → `CICOPAL`;
`master.teste@cliente.com` → `CLIENTETESTE`). Multi-contrato é proibido por padrão.

**Provisionamento de licença:** o dono cria um MASTER (senha forte validada por
`passwordPolicy`) para um novo contrato; o MASTER autentica com todas as validações e
cria sub-usuários "login rápido" amarrados ao seu `tenantid` (`tenantProvisioningService`,
`LicenseProvisioning`).

### 3.2 Esteira operacional de campo (fluxo de telas)

```
LOGIN → MODULE_SELECTION → UNIT_SELECTION → ADDRESS_SELECTION → INVENTORY
        (Gestor de Base /        (unidade operacional)   (endereço físico)
         Inventariador /
         Controle de Ativo)
```

- **Guardião atômico:** `DASHBOARD`, `ADDRESS_SELECTION` e `INVENTORY` exigem `selectedUnit`
  (sem unidade → recuo forçado para `UNIT_SELECTION`).
- **Inventory** executa filtro estrito por endereço selecionado
  (`current_selected_address` em sessionStorage) e renderiza com Virtuoso (virtualizado).
- **Scanner / Labeling / Signature:** captura de código de barras + OCR, etiquetagem de
  sobras/ativos sem etiqueta e assinatura manuscrita eletrônica de encerramento.
- **Dashboard / AssetMap / AssetDetail / Consultation:** leitura e análise com fallback Dexie.

### 3.3 Carga da base (DATABASE_MANAGER)
- Importação de **Excel (.xlsx/.csv)** via `DatabaseLoaderService`
  (`extrairDadosDaPlanilha` → `injetarDadosEmLotes`) em lotes ACID com barra de progresso.
- Restauração automática de backup físico (`verifyAndRestorePhysicalBackup`) se o
  IndexedDB estiver vazio no boot.

### 3.4 Backup / sobrevivência de dados
| Caminho | Mecanismo |
|---|---|
| Capacitor nativo | `GBR_KARDEK_DATA/local_assets_secure.dat` |
| Desktop Windows | File System Access API (`saveSnapshotToWorkspace`) |
| Nuvem | `backupService` (off) e `persistenceService` (export/restore JSON) |

### 3.5 Sync em nuvem (ativo com credenciais)
- `syncFromCloud` (App.tsx): pull **escopado ao tenant** (`fetchFullInventory` com filtro
  `tenantid` + `filial`, `'TODAS'` = sem filtro de unidade) e push local primeiro;
  guards bloqueiam sync na tela de login sem tenant (usuário por contrato).
- Upsert na nuvem escopado `onConflict('tenantid, id')` (`syncAssetsToCloud`) + índice
  único composto `(tenantid, primarykey)` no bootstrap SQL.
- `syncService.ts`: fila de sync (assetId + photoBlob), `processDataSyncQueue`,
  `addCampaignToSyncQueue`, `checkHardwareSafety` (bloqueia gravação com bateria < 5%).
- `supabaseService.ts`: ~30 funções (auth, sync, realtime, storage, auditoria).
- Modo `INTERNAL` (`isInternalMode=true`): **zero chamadas de rede**.

---

## 4. Modelo de dados (Dexie/IndexedDB — schema v7, baseline congelado em `docs/SCHEMA_BASELINE.md`)

| Tabela | Chave / índices | Observação |
|---|---|---|
| `local_assets`, `ativos`, `assets` (DexieAsset) | **`[tenantid+primarykey]`** (chave composta), `primarykey, filial, _is_synced, [tenantid+filial]` | Ativos físicos — o muro entre contratos é o `tenantid` |
| `addresses` | `++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced` | Endereços físicos |
| `audit_logs` | `id, updated_at` | Auditoria |
| `campaigns` | `id, tenantid` | Campanhas |
| `SYSTEM_CONTEXT` | `key` | Contexto |
| `unit_configs` | `id, filial` | Configurações por unidade |
| `campaign_snapshots` | `id, campaign_id` | Snapshots |

**Convenções:** isolamento multi-tenant por `tenantid` + `filial` — chave composta
`[tenantid+primarykey]` (colisão entre contratos estruturalmente impossível) + guard
`filterCrossTenantWrites` p/ escritas legadas; manipulação de dados **somente via API
Dexie** (proibido SQL raw no browser); alteração de schema = nova `version(n)` no Dexie.

> **Nota de padronização:** o campo foi unificado como **`tenantid`** em todo o código;
> variantes legadas (`tenantId`, `_tenantid`, `tenant_id`) foram eliminadas, restando apenas
> fallbacks de leitura nas fronteiras (helpers `resolveTenantId`/`readSessionTenantId`/
> `readLocalTenantId` em `src/utils/tenantUtils.ts`) e no Supabase (colunas/RLS migradas via SQL).

---

## 5. Arquitetura de navegação (ponto crítico)

Duas fontes de verdade que devem andar juntas:

1. **Estado interno:** `history: AppScreen[]` + `screen` (useState em `App.tsx`);
   `pushScreen(s, params?)` é o roteador canônico (persiste em
   `localStorage['gbr_kardek_history']`) e aplica guardas (bloqueio de `SYNC_MANAGER`
   em modo INTERNAL, barreira canônica de unidade, reset de histórico em LOGIN/MAIN_MENU).
2. **URL:** HashRouter com rotas explícitas (`/login`, `/menu`) e catch-all `*` que
   renderiza o shell baseado em `screen`. `screenToPath` (`router/routes.tsx`) mapeia
   `AppScreen → URL`; um efeito em `App.tsx` sincroniza `window.location.hash`.

> **Regra de ouro:** toda mudança de tela deve passar por `pushScreen`/`setHistory` e a URL
> deve refletir `screenToPath[screen]`. Nunca navegar só por URL nem só por estado.

**Roteamento pós-login** (`processarRoteamentoPosLoginSaas`):

| Condição | Rota | Tela |
|---|---|---|
| role DEMO | `/dashboard-demo` | DASHBOARD |
| MASTER sem tenantid | erro de consistência | — |
| base vazia + admin | `/load-database` | DATABASE_MANAGER |
| base vazia + auditor | `/auditor/aguardando-carga` | MODULE_SELECTION |
| base cheia + admin | `/saas/painel-global` | MODULE_SELECTION |
| base cheia + MASTER | `/admin/painel-controle` | MODULE_SELECTION |
| base cheia + auditor | `/auditor/selecionar-filial` | UNIT_SELECTION |

---

## 6. Chaves de estado / sessão

| Chave | Onde | Uso |
|---|---|---|
| `gbr_kardek_history` | localStorage | Pilha de telas (canônica) |
| `app_screen_history` / `app_screen_params` | localStorage | Espelho da pilha / params |
| `app_current_user` | sessionStorage | Usuário logado (JSON) |
| `gbr_admin_scope` | sessionStorage | `TENANT_MASTER` / `OPERATIONAL_AUDITOR` (MASTER DRIVE removido) |
| `tenantid`, `filial` | sessionStorage | Contexto do tenant/unidade |
| `current_selected_address` | sessionStorage | Endereço físico selecionado (anchor do inventário) |

---

## 7. Ambiente, variáveis e modos

### 7.1 Env vars

| Variável | Uso | Obrigatória? |
|---|---|---|
| `GEMINI_API_KEY` | Insights AI (`geminiService`) | não (desliga o recurso) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_SCHEMA` | Cloud mode multi-tenant (ativa o SUPABASE) | sim p/ modo nuvem |
| `VITE_ADMIN_EMAIL` | Override do e-mail admin (default `semorr@gmail.com`) | não |
| `APP_URL` / `SHARED_APP_URL` | `vite.config.ts` `define` | não |
| `VITE_API_URL` | Deploy (Vercel) | não |

### 7.2 Modos de banco (`DatabaseMode`)
`INTERNAL` · `INTERNAL_PLUS` · `SUPABASE` · `SUPABASE_PLUS` — hoje **SUPABASE** com
credenciais (Web/Desktop) · **INTERNAL** (sem rede) quando sem `VITE_SUPABASE_URL/ANON_KEY`.

### 7.3 Comandos

| Comando | Ação |
|---|---|
| `npm install --legacy-peer-deps` | Instalar dependências (obrigatório o flag) |
| `npm run dev` | Dev server Vite (porta 3000) |
| `npm run build` | Build de produção (`dist/`) |
| `npm test` | Vitest (295 testes) |
| `npm run test:e2e` | Playwright E2E |
| `npm run lint` | ESLint |
| `npx tsc -b --noEmit` | Typecheck |

---

## 8. Testes e validação

- **Vitest:** 295 testes / 30 arquivos em `src/__tests__/` (Login, localAuth, ErrorBoundary,
  Modal, useBufferController, io_buffer, schemaBaseline, securityExport, rbacService,
  tenantProvisioning, passwordPolicy, workContextUtils, routingTenantIsolation,
  postSelectionRouting, tenantContext, loadHistoryUtils, countAtivosByTenant etc.) — verdes.
- **Typecheck:** limpo ✅ (zero erros em todo o projeto) — `tsconfig.json` único com
  `skipLibCheck: true`, sem projetos referenciados (TS6310 não se aplica) e declarações
  ambient para workbox/vite-plugin-pwa. Pendência 1 da issue #6 (Fase 0) concluída.
- **E2E:** Playwright configurado (`playwright.config.ts`), depende de browsers instalados.

---

## 9. Roadmap (plano aprovado)

**Arquitetura Híbrida (aprovada):** Web/PWA mantém **Dexie/IndexedDB**, Android (Capacitor)
passa a **SQLite nativo**, **Supabase (Postgres)** vira o sistema de registro com sync
bidirecional. Plano detalhado em `docs/MIGRACAO_HIBRIDA.md` (fases 0–5 com garantias
anti-perda: export+checksum, migrador idempotente com dry-run, dual-write, rollback).

| Fase | Escopo | Status |
|---|---|---|
| 0 | Baseline estável (typecheck limpo, schema congelado, export seguro) | **Concluída** — schema v7 congelado (chave composta) + export/restore com checksum + testes |
| 1 | Camada de repositórios (`src/repositories/`) | Planejada (retomada pendente) |
| 2 | Supabase ativo (schema + RLS por `tenantid` + sync bidirecional + auth) | **Em andamento** — schema/RLS/índice único composto executados; login por contrato e sync escopado ativos |
| 3 | SQLite nativo no Android (migrador IndexedDB→SQLite, dual-write, cutover) | Planejada |
| 4 | SQLite no browser (opcional — manter Dexie se não houver ganho) | Opcional |
| 5 | Governança contínua (testes de migração, telemetria, docs) | Planejada |

**Padronização `tenantid`:** concluída no código (sweep completo, testes verdes) e no
Supabase (colunas e políticas RLS recriadas via script SQL v2).

---

## 10. Documentos relacionados

| Documento | Conteúdo |
|---|---|
| `docs/ARCHITECTURE.md` | Arquitetura interna, fluxos, checklist SRE |
| `docs/COMPONENTS_MAP.md` | Mapa mestre de navegação e dependências dos componentes |
| `docs/RBAC_GOVERNANCA.md` | Matriz de papéis e rotinas RBAC (submenus Admin/Auditoria) |
| `docs/MIGRACAO_HIBRIDA.md` | Plano de migração híbrida de dados (fases 0–5) |
| `SYSTEM_INSTRUCTIONS.md` | Governança SRE do repositório |
| `SKILL.md` | Skill de release (changelog/versão/GitHub release) |
| `CHANGELOG.md` | Histórico de versões (v2.6.0) |
| `TROUBLESHOOTING.md` | Problemas conhecidos e instalação |
| `VERCEL_DEPLOYMENT.md` | Guia de deploy Vercel |
