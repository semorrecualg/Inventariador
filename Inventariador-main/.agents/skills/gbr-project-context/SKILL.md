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
6. **`docs/PLANO_FASE_C_HIGIENIZACAO.md`** — contrato de execução da Fase C
   (padronização UPPER→canônico): helpers + `CANONICAL_KEY_MAP` + M1 (C1) e Classe T (C2)
   **entregues**; C3–C5 pendentes (decisões §9 aprovadas em 2026-08-07).
7. **`docs/SCHEMA_BASELINE.md`** — baseline congelado do `InventoryLocalStore` **v4**
   (9 tabelas + contrato de 21 colunas; travado em `schemaBaseline.test.ts`).

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
- **Loader (contrato rígido)**: planilha com **exatamente 21 colunas** em nome E ordem fixas
  (`tenantid` na posição 0; cabeçalho completo em `docs/ARCHITECTURE.md` §7.2). Carga
  **bloqueada** se o cabeçalho divergir (nome/posição) ou se `tenantid` estiver ausente/vazio.
- **Fase C — higienização canônica (chaves/valores UPPER→lower)**: helpers em
  `src/utils/normalize.ts` — `normalizeClassK` (UPPER+TRIM+expurgo `[^A-Z0-9-]`),
  `normalizeClassT` (TRIM+colapso, **caixa preservada** — `status`/`descricaodoativo`/
  `nomefornecedor`), `normalizeUpperTrim` (`filial` preserva espaços internos),
  `normalizeFieldValue` (regra por campo), `pickCanonical` (leitura tolerante: canônico
  minúsculo vence, UPPER é fallback — remover só na C5), `canonicalKey` e a flag
  `NORMALIZE_ON_UPGRADE`. `CANONICAL_KEY_MAP` em `src/constants/schema.ts` resolve variantes
  de cabeçalho. A carga (M1) já aplica `normalizeFieldValue` nos 3 caminhos do
  `DatabaseLoaderService`. Identidade/PK (`etiqueta`, `tag`, `primarykey`) só TRIM na C1
  (política definida na C4). Supabase: `public.assets` **no-op definitivo** · `staging`
  **fora de escopo**.
- **Dados**: manipular persistência **somente via API Dexie** (`localDb`/`sqliteService`,
  transações `db.transaction('rw', …)`). Proibido SQL raw/inline. Respeitar isolamento por
  tenant (`[tenantid+filial]`). Mudança de schema = nova `version(n)` no
  `InventoryDexieDatabase` (`sqliteService.ts`).
- **Auth**: 3 camadas (MASTER DRIVE → Dexie → Barreira local/Supabase). Não quebrar o bypass
  `Glaucio@1970`/`admin` nem o perfil `semorr@gmail.com`.
- **Modos**: `INTERNAL` = sem rede (`isInternalMode=true`). **Supabase ativo** com schema
  padronizado no modo `SUPABASE_PLUS`, porém desligado por padrão. Gemini é opcional.
- **Impacto em cascata**: mudanças em telas/estado exigem análise upstream e downstream
  (`MODULE_SELECTION → UNIT_SELECTION → DASHBOARD → ADDRESS_SELECTION → INVENTORY`).

## 3. Portões de validação (antes de dar por concluído)

1. `npx tsc -b --noEmit` → **zero erros em `src/`** (erros em
   `node_modules`/config de terceiros são pré-existentes — não produzir novos).
2. `npx vitest run` → **16 arquivos / 165 testes verdes**
   (inclui `normalize`/`pickCanonical`/`loaderNormalization`/`schemaBaseline` da Fase C).
3. Bugs de fluxo/UI → reproduzir em navegador (Playwright headless) e/ou `freebuff-preview`.
4. Atualizar **`docs/ARCHITECTURE.md`** sempre que a arquitetura mudar (novas telas, fluxos,
   tabelas ou schema).

## 4. Pendências conhecidas

Ver issue #6 (`semorrecualg/Inventariador`) e seção "Pendências" do `ARCHITECTURE.md`:
typecheck limpo (Fase 0 concluída — tsconfig único + declarações ambient; ver `docs/MIGRACAO_HIBRIDA.md`), `logo.png` placeholder,
`sessionStorage.clear()` do MASTER DRIVE, fluxo "base vazia" no Gestor de Base.
(Supabase já ativo com schema `tenantid` + `filial` padronizado — migrações em `scripts/`.)

**Fase C pendente (ver `docs/PLANO_FASE_C_HIGIENIZACAO.md` §4–§5):** C3 (coerções N/D/F) ·
M2 (chaves UPPER→lower, ~700 ocorrências em 40+ arquivos via `pickCanonical`/canônicas) ·
C4 (migração Dexie `version(5)` com dry-run + flag `NORMALIZE_ON_UPGRADE`; atualizar
`schemaBaseline.test.ts` para verno 5 e `docs/SCHEMA_BASELINE.md`) · C5 (remoção da
 tolerância `pickCanonical` + varredura final `grep` de UPPER em `src/` fora de `schema.ts`).

## 5. Manutenção deste skill

- O **conteúdo técnico vive no `docs/ARCHITECTURE.md`** (fonte de verdade versionada).
- Este skill apenas **garante o carregamento do contexto**. Se a arquitetura mudar,
  atualize o doc, não este arquivo (a menos que as regras de leitura mudem).
