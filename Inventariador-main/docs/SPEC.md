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
ativos em mapa e gera relatórios — tudo **100% offline**, com empacotamento Android via
Capacitor e sincronização em nuvem (Supabase) pronta porém desligada por padrão.

- **Domínio:** GBR Auditoria (controle patrimonial / inventário físico de ativo imobilizado).
- **Público:** auditores de campo, gestores de base e administradores (multi-tenant por filial).
- **Modo de operação atual:** `INTERNAL` (offline-first, sem chamadas de rede).

---

## 2. Stack tecnológica

| Camada | Tecnologia | Observação |
|---|---|---|
| UI | React 18 + TypeScript + Vite 5 | Build toolchain |
| Estilo | Tailwind CSS v4 + Motion + Lucide | `@tailwindcss/vite` |
| Roteamento | React Router `HashRouter` | Compatível com `file://` no Capacitor |
| Estado | State local em `App.tsx` (máquina de telas) + Zustand (`stores/`) | `uiStore`, `authStore`, `inventoryStore`, `syncStore` |
| Persistência local | **Dexie.js / IndexedDB** — banco `InventoryLocalStore` | Schema v4 (9 tabelas — baseline em `docs/SCHEMA_BASELINE.md`) |
| Nuvem (desligada) | Supabase (`@supabase/supabase-js`) + Gemini (`@google/genai`) | `isInternalMode = true` |
| Mobile | Capacitor 6 (Android) | APK via GitHub Actions |
| Banco nativo Android (fase 3) | `@capacitor-community/sqlite` + `jeep-sqlite` + `sql.js` | Instalados, ainda não usados |
| Testes | Vitest (13 arquivos / 144 testes) + Playwright (E2E) | `npm test`, `npm run test:e2e` |
| Qualidade | ESLint + TypeScript + Husky | `npm run lint` |

**Dependências principais:** react, react-dom, dexie, @supabase/supabase-js, @google/genai,
@capacitor/*, maplibre-gl, @turf/turf, xlsx, jspdf, tesseract.js, html5-qrcode,
react-signature-canvas, react-virtuoso, recharts, zustand, motion, lucide-react.

---

## 3. Requisitos funcionais

### 3.1 Autenticação (3 camadas)
1. **MASTER DRIVE (bypass soberano):** credencial `Glaucio@1970` / `admin` → escopo
   `GLOBAL_SUPER_ADMIN`, pula Dexie/SQLite/Supabase.
2. **Dexie local (offline):** autentica contra `localDb.users`; papéis
   `TENANT_MASTER` / `OPERATIONAL_AUDITOR`.
3. **Supabase Cloud:** somente em `databaseMode = SUPABASE_PLUS`; usuário cloud é
   persistido localmente para acesso offline posterior.

Perfis conhecidos:

| Perfil | Usuário / E-mail | Senha |
|---|---|---|
| MASTER DRIVE (bypass) | `Glaucio@1970` | `admin` |
| Admin (perfil) | `semorr@gmail.com` (`VITE_ADMIN_EMAIL`) | `admin` ou `Glaucio@1970` |
| Backup admin (legado) | `admin` | `123456` |

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

### 3.5 Sync em nuvem (desligado por padrão)
- `syncService.ts`: fila de sync (assetId + photoBlob), `processDataSyncQueue`,
  `addCampaignToSyncQueue`, `checkHardwareSafety` (bloqueia gravação com bateria < 5%).
- `supabaseService.ts`: ~30 funções prontas (auth, sync, realtime, storage, auditoria).
- Modo `INTERNAL` (`isInternalMode=true`): **zero chamadas de rede**.

---

## 4. Modelo de dados (Dexie/IndexedDB — schema v4, baseline congelado em `docs/SCHEMA_BASELINE.md`)

| Tabela | Chave / índices | Observação |
|---|---|---|
| `local_assets`, `ativos`, `assets` (DexieAsset) | `primarykey, filial, _is_synced, [tenantid+filial]` | Ativos físicos |
| `addresses` | `++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced` | Endereços físicos |
| `audit_logs` | `id, updated_at` | Auditoria |
| `campaigns` | `id, tenantid` | Campanhas |
| `SYSTEM_CONTEXT` | `key` | Contexto |
| `unit_configs` | `id, filial` | Configurações por unidade |
| `campaign_snapshots` | `id, campaign_id` | Snapshots |

**Convenções:** isolamento multi-tenant por `tenantid` + `filial`; manipulação de dados
**somente via API Dexie** (proibido SQL raw no browser); alteração de schema = nova
`version(n)` no Dexie.

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
| `gbr_admin_scope` | sessionStorage | `GLOBAL_SUPER_ADMIN` / `TENANT_MASTER` / `OPERATIONAL_AUDITOR` |
| `tenantid`, `filial` | sessionStorage | Contexto do tenant/unidade |
| `current_selected_address` | sessionStorage | Endereço físico selecionado (anchor do inventário) |

---

## 7. Ambiente, variáveis e modos

### 7.1 Env vars

| Variável | Uso | Obrigatória? |
|---|---|---|
| `GEMINI_API_KEY` | Insights AI (`geminiService`) | não (desliga o recurso) |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SUPABASE_SCHEMA` | Cloud mode (off) | não |
| `VITE_ADMIN_EMAIL` | Override do e-mail admin (default `semorr@gmail.com`) | não |
| `APP_URL` / `SHARED_APP_URL` | `vite.config.ts` `define` | não |
| `VITE_API_URL` | Deploy (Vercel) | não |

### 7.2 Modos de banco (`DatabaseMode`)
`INTERNAL` · `INTERNAL_PLUS` · `SUPABASE` · `SUPABASE_PLUS` — hoje **INTERNAL** (sem rede).

### 7.3 Comandos

| Comando | Ação |
|---|---|
| `npm install --legacy-peer-deps` | Instalar dependências (obrigatório o flag) |
| `npm run dev` | Dev server Vite (porta 3000) |
| `npm run build` | Build de produção (`dist/`) |
| `npm test` | Vitest (144 testes) |
| `npm run test:e2e` | Playwright E2E |
| `npm run lint` | ESLint |
| `npx tsc -b --noEmit` | Typecheck |

---

## 8. Testes e validação

- **Vitest:** 144 testes / 13 arquivos em `src/__tests__/` (Login, localAuth, masterDrive,
  ErrorBoundary, Modal, useBufferController, io_buffer, schemaBaseline, securityExport etc.) — verdes.
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
| 0 | Baseline estável (typecheck limpo, schema congelado, export seguro) | **Em andamento** (typecheck ✅ concluído; falta snapshot do schema + export/restore) |
| 1 | Camada de repositórios (`src/repositories/`) | Planejada |
| 2 | Supabase ativo (schema + RLS por `tenantid` + sync bidirecional + auth) | SQL de migração executado no Supabase (RLS/colunas `tenantid`) |
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
| `docs/MIGRACAO_HIBRIDA.md` | Plano de migração híbrida de dados (fases 0–5) |
| `SYSTEM_INSTRUCTIONS.md` | Governança SRE do repositório |
| `SKILL.md` | Skill de release (changelog/versão/GitHub release) |
| `CHANGELOG.md` | Histórico de versões (v2.6.0) |
| `TROUBLESHOOTING.md` | Problemas conhecidos e instalação |
| `VERCEL_DEPLOYMENT.md` | Guia de deploy Vercel |
