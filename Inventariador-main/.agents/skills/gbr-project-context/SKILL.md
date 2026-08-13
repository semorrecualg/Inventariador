---
name: gbr-project-context
description: Mandatory project context for the GBR KARDEK Inventariador repo (React + Vite + Dexie + Supabase hybrid offline-first audit app). Load BEFORE any analysis, fix, refactor or review. Enforces reading docs/ARCHITECTURE.md as the single source of truth and the repo's SRE validation gates.
---

# GBR KARDEK – Inventariador · Contexto de Projeto (Obrigatório)

## Quando usar

**Sempre** que houver trabalho neste repositório: análise, correção de bug, refactor, revisão de código, adição de feature, teste ou investigação de fluxo.

## 1. Leitura OBRIGATÓRIA antes de qualquer ação

Antes de propor, gerar ou alterar qualquer código, **leia integralmente**:

1. **`docs/ARCHITECTURE.md`** — *fonte de verdade* da arquitetura:
   navegação (dois sistemas), boot, pipeline de auth em 3 camadas, roteamento pós-login,
   fluxo de dados offline (Dexie/IndexedDB), telas, chaves de sessão, env vars, pendências.
2. **`docs/COMPONENTS_MAP.md`** — mapa mestre de navegação/dependências dos componentes.
3. **`SYSTEM_INSTRUCTIONS.md`** — governança SRE do repositório (regras de roteamento e persistência).
4. **`CHANGELOG.md`** — histórico recente de versões (convenções e regressões conhecidas).
5. **`docs/HIGIENIZACAO_ENDERECO.md`** — auditoria estrutural fechada do campo
   `endereco`/assets: `public.assets` 26/26 colunas canônicas (**no-op definitivo** —
   nenhuma DDL) · `staging.assets` = schema morto, fora de escopo (Fase D).
6. **`docs/PLANO_FASE_C_HIGIENIZACAO.md`** — **Fase C concluída** (2026-08-07, C1–C5):
   padronização UPPER→canônico minúsculo aplicada no loader e nas leituras; schema canônico
   ativo (baseline v7).
7. **`docs/SCHEMA_BASELINE.md`** — baseline congelado do `InventoryLocalStore` **v7**
   (9 tabelas + contrato de 21 colunas; **chave composta `[tenantid+primarykey]`** nas 3
   tabelas de ativos; travado em `schemaBaseline.test.ts` — `verno === 7`).

> Se o `docs/ARCHITECTURE.md` não existir, crie-o antes de prosseguir (estrutura base na seção 5).

## 2. Regras críticas (resumo operacional)

- **Navegação dual**: a tela é dirigida pelo estado interno (`history`/`screen` no `App.tsx`,
  via `pushScreen`/`setHistory`) E pela URL (`HashRouter` + `screenToPath`). **Toda mudança de
  tela deve passar por `pushScreen`/`setHistory` e a URL deve refletir `screenToPath[screen]`**
  (efeito de sync em `App.tsx`). Nunca navegar só por URL ou só por estado.
- **Guardas**: "Barreira Canônica" — `DASHBOARD`, `ADDRESS_SELECTION`, `INVENTORY` exigem
  `selectedUnit` (recuo forçado para `UNIT_SELECTION`); `DATABASE_MANAGER` só para super admin.
- **Schema multi-tenant canônico**: colunas canônicas **`tenantid`** (minúsculo, sempre vinda
  da planilha — nunca valor fixo em código) e **`filial`**. `_unitid`, `tenantId`, `tenant_id`
  são **legadas**: leitura permitida apenas como fallback via `utils/tenantUtils.ts`
  (`resolveTenantId`, `readLocalTenantId`, `readSessionTenantId`); **escrita proibida**.
  Alterações de schema no Supabase passam por `scripts/migrate-*-supabase.sql`.
- **Muro multi-tenant**: chave composta local `[tenantid+primarykey]` (migração v6→v7 em 2
  passos, `filterCrossTenantWrites`) + nuvem com índice único composto `(tenantid, primarykey)`
  e upsert `onConflict('tenantid, id')`. **NUNCA** propor chave única global de volta.
- **Loader (contrato rígido)**: planilha com **exatamente 21 colunas** em nome E ordem fixas
  (`tenantid` na posição 0; cabeçalho completo em `docs/ARCHITECTURE.md` §7.2). Carga
  **bloqueada** se o cabeçalho divergir (nome/posição) ou se `tenantid` estiver ausente/vazio.
- **Dados**: manipular persistência **somente via API Dexie** (`localDb`/`sqliteService`,
  transações `db.transaction('rw', …)`). Proibido SQL raw/inline. Mudança de schema = nova
  `version(n)` no `InventoryDexieDatabase` (`sqliteService.ts`).
- **Login por contrato**: cada usuário é amarrado a UM `tenantid` (ex.: `semorr@gmail.com` →
  `CICOPAL`). **Não existe "GLOBAL"**: admin/master sem contrato tem login bloqueado (Barreira
  Local consulta a nuvem e, sem contrato, bloqueia). Dados exibidos/sincronizados somente do
  contrato do usuário; `TenantWorkSelector` pós-login para multi-contrato/multi-filial.
- **RBAC**: `src/services/rbacService.ts` + `PermissionGate` — matriz em
  `docs/RBAC_GOVERNANCA.md`. **Provisionamento:** `LicenseProvisioning` +
  `tenantProvisioningService` + `passwordPolicy` (MASTER com senha forte; sub-usuários de
  "login rápido" amarrados ao tenant do MASTER).
- **Modos**: `isInternalMode = !(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)` — flag
  **derivada do ambiente**, nunca hard-coded. Com credenciais (`.env.local` presente) →
  **Supabase ATIVO** (auth + dados + sync, modo `SUPABASE_PLUS`); sem credenciais (build sem
  secrets, ex.: CI) → `INTERNAL` (offline puro, zero chamadas de rede). **Hoje: Supabase ativo.**
- **Impacto em cascata**: mudanças em telas/estado exigem análise upstream e downstream
  (`MODULE_SELECTION → UNIT_SELECTION → DASHBOARD → ADDRESS_SELECTION → INVENTORY`).

## 3. Portões de validação (antes de dar por concluído)

1. `npx tsc -b --noEmit` → **zero erros em `src/`** (erros em
   `node_modules`/config de terceiros são pré-existentes — não produzir novos).
2. `npx vitest run` → **30 arquivos / 295 testes verdes**.
3. Bugs de fluxo/UI → reproduzir em navegador (Playwright headless) e/ou `freebuff-preview`.
4. Atualizar **`docs/ARCHITECTURE.md`** sempre que a arquitetura mudar (novas telas, fluxos,
   tabelas ou schema).

## 4. Pendências conhecidas

Ver issue #6 (`semorrecualg/Inventariador`) e §14 "Pendências conhecidas" do `ARCHITECTURE.md`:
`public/logo.png` placeholder (gerar ícones PWA reais) · fluxo "base vazia" no Gestor de Base ·
exibição de filiais homônimas entre contratos (separadas no banco pela chave composta;
a exibição por nome de filial ainda mistura contratos — próximo passo).

## 5. Manutenção deste skill

- O **conteúdo técnico vive no `docs/ARCHITECTURE.md`** (fonte de verdade versionada).
- Este skill apenas **garante o carregamento do contexto**. Se a arquitetura mudar,
  atualize o doc, não este arquivo (a menos que as regras de leitura mudem).
