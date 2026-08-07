# GBR KARDEK – Inventariador · Correção — `InventoryCard` ↔ `Inventory` no módulo ATIVO IMOBILIZADO

> **Status:** ✅ EXECUTADO (2026-08-06) — alterações aplicadas em `src/` e validadas
> (`tsc -b --noEmit` limpo + 144 testes verdes)
> **Data:** 2026-08-06 · **Alinhado a:** `docs/ANALISE_TABELAS_ATIVOS_ASSETS.md`
> (decisão aprovada: **`assets` = tabela de trabalho canônica/operacional**,
> `local_assets` = baseline imutável, `ativos` = sai)
> **Fontes:** `docs/COMPONENTS_MAP.md` · `docs/FLOW_GRAPH.md` · `docs/ARCHITECTURE.md` · `docs/SPEC.md`

---

## 1. Objetivo (pedido do usuário, decodificado)

> “Estamos usando o componente `InventoryCard.tsx`. Mover este card para o módulo de
> **ATIVO IMOBILIZADO**. No local atual, o correto é o componente `Inventory.tsx`.
> Importante: ver as conexões do componente a ser corrigido, para que fique atualizado
> com a **tabela de trabalho**.”

| Componente | Onde está hoje | Onde deve ficar | Papel |
|---|---|---|---|
| `src/components/InventoryCard.tsx` | (suspeito) no fluxo de inventário/lista onde deveria estar o motor completo | **Módulo ATIVO IMOBILIZADO** → tela `ASSET_CONTROL_HOME` (`/asset-control`, nó `ASSET_CONTROL` do grafo) | **Card de entrada** do módulo: visão resumida/sumário que leva ao fluxo operacional |
| `src/components/Inventory.tsx` | componente existente (motor do inventário) | **No lugar do `InventoryCard`** no fluxo de inventário (tela `INVENTORY`, `/inventory`) | **Motor de renderização** da listagem de ativos filtrada (filtro por endereço, Virtuoso) — `COMPONENTS_MAP.md` §1/§2 |

**Módulo ATIVO IMOBILIZADO = “Controle de Ativos e Movimentações”** (`ASSET_CONTROL_HOME`,
rota `/asset-control`) — conf. `FLOW_GRAPH.md` (nó `ASSET_CONTROL`) e `SPEC.md` §3.2
(módulos do `MODULE_SELECTION`: Gestor de Base / Inventariador / **Controle de Ativo**).

---

## 2. Situação atual vs alvo (topologia)

```
HOJE (a corrigir)
  MODULE_SELECTION (/modules)
    └─ “Controle de Ativo” (ATIVO IMOBILIZADO) ──> ASSET_CONTROL_HOME (/asset-control)
         └─ renderiza ??? (componente errado)
  INVENTORY (/inventory)
    └─ renderiza InventoryCard.tsx  ← errado: aqui é o motor completo

ALVO
  MODULE_SELECTION (/modules)
    └─ “Controle de Ativo” (ATIVO IMOBILIZADO) ──> ASSET_CONTROL_HOME (/asset-control)
         └─ renderiza InventoryCard.tsx   ← card de entrada do módulo ✅
  INVENTORY (/inventory)
    └─ renderiza Inventory.tsx            ← motor da listagem operacional ✅
```

---

## 3. Conexões a verificar (tabela de trabalho = `assets`)

Tudo que o componente corrigido **ler ou escrever** deve apontar para a tabela **`assets`**
(canônica/operacional — decisão aprovada). Checklist por camada:

### 3.1 Origem de dados (leitura)
- [ ] Consulta/lista: `db.assets` (via API Dexie / `localDb`; futuro `AssetRepository` da Fase 1).
      **Proibido** usar `db.ativos` (legado) ou `db.local_assets` (baseline) para dados operacionais.
- [ ] Isolamento multi-tenant: sempre `[tenantid+filial]` (helpers `utils/tenantUtils.ts`).
- [ ] Filtro de endereço: respeitar `current_selected_address` (sessionStorage) no `Inventory.tsx`
      (`fetchUnitAssets` no `App.tsx` com restrição de `endereco`, conf. `COMPONENTS_MAP.md` §3).
- [ ] Shape: campos `DexieAsset` (PK `primarykey`; `status`, `etiqueta`, `qt`, `descricaodoativo`,
      flags `_conferido/_is_synced/...` — `docs/SCHEMA_BASELINE.md` §3.1).

### 3.2 Escrita (somente no fluxo de auditoria, só em `assets`)
- [ ] Conferência/baixa/etiquetagem/novo ativo → `db.assets` (nunca `local_assets`/`ativos`).
- [ ] Flags de sync/campanha preservadas (`_is_synced`, `currentCampaignId`, `_is_deleted`, …).
- [ ] `audit_logs` continua sendo o registro de trilha (não guardar estado operacional lá).

### 3.3 Navegação (regra de ouro)
- [ ] Toda mudança de tela via `pushScreen`/`setHistory` (URL sincronizada via `screenToPath`).
- [ ] `InventoryCard` (card do módulo) → navega para o fluxo correto
      (`ASSET_CONTROL` → … → `INVENTORY`), respeitando a Barreira Canônica (`selectedUnit`).
- [ ] `Inventory.tsx` mantém as transições do grafo: `ADDR_SEL → INVENTORY`, `INVENTORY → ASSET_DETAIL/SIGNATURE`.

### 3.4 Supabase/sync (quando ativo)
- [ ] `assets` (local) ⇄ `assets` (nuvem) — LWW `_lastUpdated/_version`; `local_assets` nunca sobe.

---

## 4. Roteiro de execução no repositório real (`semorrecualg/Inventariador`)

```bash
# 0) Confirmar onde cada componente é renderizado hoje (src/ está no repo real)
rg -n "InventoryCard|Inventory\.tsx|<Inventory|ASSET_CONTROL_HOME|asset-control" src/ | head -60

# 1) Mover o card para o módulo ATIVO IMOBILIZADO
#    - src/components/ModuleSelector.tsx (ou a tela que renderiza ASSET_CONTROL_HOME)
#      → usar <InventoryCard …/> no card do módulo “Controle de Ativo”
#    - garantir props de navegação (onOpen/onNavigate) → pushScreen para o fluxo

# 2) Trocar no fluxo de inventário
#    - onde hoje renderiza <InventoryCard …/> na tela INVENTORY, renderizar <Inventory …/>
#    - conferir props: unidade selecionada, endereço (current_selected_address), callbacks de auditoria

# 3) Verificar origem de dados (tabela de trabalho)
rg -n "db\.ativos|db\.local_assets|table\(['\"]ativos|table\(['\"]local_assets" src/ | head -40
rg -n "db\.assets" src/ | head -60
#   → qualquer leitura operacional em `ativos`/`local_assets` deve migrar para `assets`

# 4) Validar
npx tsc -b --noEmit          # zero erros em src/
npx vitest run               # 144 testes verdes (inclui schemaBaseline e navigationMap)
```

**Critérios de aceite (verificado em 2026-08-06):**
- ✅ Módulo ATIVO IMOBILIZADO (`/asset-control` → `AssetControlModule`) exibe `InventoryCard`
  (seção “Inventário em Destaque” no Dashboard, até 3 ativos da tabela de trabalho `assets`);
- ✅ Tela `INVENTORY` (`/inventory`) renderiza `Inventory.tsx` (motor canônico Virtuoso,
  leitura via `assetRepository` → `localDb.assets`);
- ✅ `tsc -b --noEmit` limpo + 144 testes verdes (13 arquivos);
- ✅ Zero imports restantes de `InventoryScreen` no `src/` (export órfão mantido em
  `InventoryCard.tsx` para não quebrar o contrato do arquivo — pode ser removido depois).

**Rollback:** reverter o commit da correção (mudança de UI/roteamento, sem migração de dados).

---

## 5. Pós-execução (artefatos deste workspace)

- ✅ Este documento: correção marcada como executada.
- [ ] `docs/COMPONENTS_MAP.md` §1 — registrar `InventoryCard` no módulo ATIVO IMOBILIZADO;
- [ ] `docs/FLOW_GRAPH.md` — nota no nó `ASSET_CONTROL` (render de `InventoryCard`);
- [ ] Remover o export órfão `InventoryScreen` de `InventoryCard.tsx` (sem imports restantes)
      em um commit separado, se desejado.
