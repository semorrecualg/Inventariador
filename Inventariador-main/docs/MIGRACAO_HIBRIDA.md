# Plano de Migração Híbrida de Dados — Dexie + SQLite Nativo + Supabase

> **Status:** APROVADO (decisão de arquitetura) · **Data:** 2026-08-03
> **Objetivo:** evoluir a camada de dados para a arquitetura híbrida em fases,
> **sem perda de dados**, com conectividade e manutenção via **Supabase**.
> Este documento é o registro canônico do plano; o acompanhamento operacional
> fica na **GitHub Issue** vinculada ao repositório `semorrecualg/Inventariador`.

---

## 1. Decisão de arquitetura (alvo)

**Arquitetura Híbrida (aprovada):** cada plataforma usa o motor mais adequado, com
uma **única camada de repositórios** por trás das telas:

```
┌─────────────────────────────────────────────────────────────┐
│  TELAS / SERVIÇOS (App.tsx, components, services)           │
│  → 292 pontos de contato hoje (localDb/db/sqliteService)     │
└───────────────────────────┬─────────────────────────────────┘
                            │  (Fase 1) Repositories (interface única)
        ┌───────────────────┼───────────────────────┐
        ▼                   ▼                       ▼
┌───────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ WEB / PWA     │  │ ANDROID (Capacitor)  │  │ NUVEM (Supabase)     │
│ Dexie/IndexedDB│  │ SQLite NATIVO        │  │ Postgres = fonte de  │
│ (manter)       │  │ @capacitor-community │  │ verdade + auth +     │
│               │  │ /sqlite (Fase 3)     │  │ realtime + storage   │
└───────────────┘  └──────────────────────┘  └──────────────────────┘
        └────────────── Sync bidirecional (Fase 2) ──────────────┘
```

**Princípios:**
1. **Zero perda de dados** — export/backup validado antes de cada fase; migradores
   idempotentes com dry-run; dual-write na transição; rollback por restauração.
2. **Mudança invisível** — as telas não mudam de contrato; quem muda é a camada de dados.
3. **Supabase como sistema de registro** (fonte de verdade na nuvem), local como cache operacional.

---

## 2. Estado atual (diagnóstico de base)

| Item | Situação |
|---|---|
| Persistência real | 100% **Dexie/IndexedDB** — banco `InventoryLocalStore` (schema **v4** — baseline congelado em `docs/SCHEMA_BASELINE.md`) |
| `sqliteService.getStorageSource()` | Retorna `'DEXIE_INDEXEDDB'` (hardcoded) |
| `sql.js`, `jeep-sqlite`, `@capacitor-community/sqlite` | **Instalados + assets wasm configurados, mas NÃO usados em código** (grep em `src` = zero) |
| Checagens `'PHYSICAL'`/`'CACHE'` no App.tsx | Código morto (nunca casam) |
| Supabase | **Integração completa já codificada** (~30 funções: auth, sync, realtime, storage, auditoria) — desligada por `isInternalMode = true` |
| Pontos de contato com dados | **292** em `src` (excl. testes) |
| Tabelas Dexie | `local_assets`, `ativos`, `assets`, `addresses`, `audit_logs`, `campaigns`, `SYSTEM_CONTEXT`, `unit_configs`, `campaign_snapshots` |
| Backups existentes | Capacitor `GBR_KARDEK_DATA/local_assets_secure.dat`, File System Access (Windows), `backupService` (nuvem), `persistenceService` (export/restore) |

---

## 3. Fases

### Fase 0 — Baseline estável (pré-requisito de tudo)
- [x] **Corrigir typecheck** (pendência 1 da issue #6) ✅ 2026-08-06 — a dívida
      (workbox/rollup/@tailwindcss/vite/vite-plugin-pwa/TS6310) não reproduz mais: o
      `tsconfig.json` foi consolidado em config único com `skipLibCheck: true` e sem
      `references` (TS6310 estruturalmente impossível), e existem declarações ambient
      `src/types/workbox.d.ts` + `src/types/pwa-assets-generator.d.ts`. Verificado com
      `tsc -b --force` e `tsc --noEmit -p` → **zero erros**. Baseline limpo para mover os 292 pontos.
- [x] Congelar o **schema atual** (snapshot das 9 tabelas Dexie + `schema.ts`) ✅ 2026-08-06
      — `docs/SCHEMA_BASELINE.md` (v4 canônica `tenantid`) + contrato `src/__tests__/schemaBaseline.test.ts`.
- [x] **Export de segurança** completo: JSON + `.dat` físico + contagem por tabela
      (checksum SHA-256) ✅ 2026-08-06 — `src/services/securityExportService.ts`
      (`buildSecurityExport`/`restoreSecurityExport`/`serializeSecurityExport`, com
      persistência `.dat` Capacitor e download `.json`/`.dat` no Web).
- [x] Testar **backup → restore** de ponta a ponta ✅ 2026-08-06
      — `src/__tests__/securityExport.test.ts` (6 testes, `fake-indexeddb`): round-trip
      de checksum, contagem/checksum por tabela, anti-downgrade, tolerância a tabelas
      ausentes e isolamento de tabelas fora do manifesto.
- [x] **Análise DBA da redundância `ativos`/`assets`/`local_assets`** ✅ 2026-08-06
      (decisão confirmada) — as 3 tabelas são espelhos idênticos (`DexieAsset`, PK
      `primarykey`, índices iguais) com **triple-write** no loader; **papéis aprovados:**
      **`assets` = canônica/operacional** (sync → Supabase `assets`),
      **`local_assets` = baseline imutável** (comparação), **`ativos` = legado → sai na
      Fase 1** (`version(5)` idempotente com dry-run). Registro:
      `docs/ANALISE_TABELAS_ATIVOS_ASSETS.md`.
- **Critério de aceite:** `tsc` limpo em `src/`; 144 testes verdes (13 arquivos); restore validado.
- **Risco:** baixo. **Rollback:** n/a (não altera runtime).

### Fase 1 — Camada de Repositórios (abstração)
- [ ] Criar `src/repositories/`: `AssetRepository`, `AuditRepository`, `CampaignRepository`,
      `UnitRepository`, `ContextRepository` — interface única por domínio.
- [ ] Implementar 1º backend = **Dexie** (delega para `localDb`/`db` atuais, comportamento idêntico).
- [ ] Migrar os **292 touchpoints** para os repositórios (telas/serviços não tocam mais em `db.*` direto).
- [ ] Testes de repositório (mock do backend) + 144 testes existentes verdes.
- **Critério de aceite:** nenhuma mudança de comportamento; testes verdes; rollback = reverter imports.
- **Risco:** médio (refactor amplo). **Rollback:** trivial (commit anterior).

### Fase 2 — Supabase ativo (conectividade & manutenção)
- [ ] Provisionar projeto Supabase (Postgres + Auth + Storage).
- [ ] **Schema SQL** de migrações (tabelas: `profiles`, `users`, `inventory`, `assets`,
      `audit_logs`, `campaigns`, `campaign_snapshots`, `unit_configs`, `system_context`…)
      + **RLS** (Row Level Security) por `tenant_id`.
- [ ] Configurar env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_PROJECT_REF` (via Keys/API keys do ambiente).
- [ ] Ativar sync: `isInternalMode=false` (via env/flag) e usar as funções já prontas
      (`syncAssetsToCloud`, `fetchFullInventory`, `subscribeToInventoryChanges`,
      `subscribeToAssetChanges`, `uploadAssetPhoto`…).
- [ ] **Estratégia de conflito:** last-write-wins usando `_lastUpdated`/`_version` (campos já existentes).
- [ ] **Migração inicial de dados:** upload do export da Fase 0 (dry-run → idempotente → real).
- [ ] Auth: email/senha (já existe `signIn/signUp`) + magic link; perfis vinculados ao tenant.
- **Critério de aceite:** login cloud, sync bidirecional com realtime, fotos no storage,
      auditoria registrada; desconexão → fila local → reconciliação ao voltar.
- **Risco:** médio (segurança/RLS). **Rollback:** `isInternalMode=true` (flag única).

### Fase 3 — SQLite NATIVO no Android (Capacitor)
- [ ] Ligar `@capacitor-community/sqlite` (deps já instalados): `initSQLite`, `openDatabase`,
      criação das 9 tabelas espelhando o schema Dexie.
- [ ] **Migrador IndexedDB→SQLite nativo**: leitura via Dexie → escrita em lotes no SQLite;
      **idempotente** (checksum/contagem), com **dry-run** e barra de progresso.
- [ ] **Dual-write** durante a transição (Dexie + SQLite) com flag de feature.
- [ ] Cutover: leitura primária no SQLite nativo; backup físico `.dat` mantido.
- **Critério de aceite:** APK com banco em disco; migração validada registro a registro;
      rollback = restaurar backup + flag.
- **Risco:** alto (mobile). **Rollback:** restauração `.dat` + reverter flag.

### Fase 4 — SQLite no browser (OPCIONAL — decisão de trade-off)
- [ ] Avaliar necessidade real (hoje IndexedDB atende 12k+ ativos com queries reativas).
- [ ] Se decidido: `sql.js`/OPFS com persistência explícita + sync com os repositórios.
- **Critério de aceite:** ganho medido de performance/capacidade; senão, manter Dexie.
- **Risco:** médio-alto (Safari/OPFS, serialização manual). **Rollback:** manter backend Dexie (benefício da Fase 1).

### Fase 5 — Governança contínua
- [ ] **Testes de migração automatizados** (integridade de dados por tabela, checksum, contagem).
- [ ] Monitoramento via `telemetryService` + logs SRE (`logger`).
- [ ] Documentação atualizada: `ARCHITECTURE.md` (novo § sobre o roadmap), este plano, skill.
- [ ] Critérios de aceite do projeto inteiro: **zero perda**, `tsc` limpo, testes verdes,
      APK + PWA + cloud operando com o mesmo conjunto de dados.

---

## 4. Garantias anti-perda (checklist por fase)

- [ ] Export completo + checksum antes de iniciar a fase.
- [ ] Migrador idempotente (pode rodar N vezes) com dry-run.
- [ ] Dual-write ou flag de feature durante transições.
- [ ] Teste de restauração executado (não apenas documentado).
- [ ] Contagem de registros por tabela conferida antes/depois de cada fase.

---

## 5. Sequenciamento vs. correções do app

- **Primeiro:** pendência 1 da issue #6 (typecheck limpo) — Fase 0. ✅ concluída (2026-08-06).
- **Depois:** demais correções pequenas da issue #6 (independentes da migração).
- **Registrada ✅ 2026-08-06:** correção `InventoryCard` ↔ `Inventory` no módulo ATIVO
  IMOBILIZADO — `InventoryCard.tsx` vai para o módulo `ASSET_CONTROL_HOME`
  (`/asset-control`) como card de entrada; a tela `INVENTORY` (`/inventory`) passa a
  renderizar `Inventory.tsx` (motor da listagem). Todas as conexões de leitura/escrita
  do componente corrigido devem apontar para a **tabela de trabalho `assets`**
  (canônica — decisão aprovada). Execução no repositório real (`src/` não está neste
  workspace); registro: `docs/CORRECAO_INVENTORYCARD_MODULO_ATIVO.md`.
- **Em paralelo/sequencial:** Fase 1 (repositórios) pode coexistir com correções de UI,
  pois não muda comportamento.
- **Não misturar:** Fases 2–3 (Supabase/SQLite) entram com o baseline estável, testes verdes
  e plano de rollback em mãos.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Perda de dados na migração | Export+checksum, dry-run, idempotência, restore testado |
| Regressão nos 292 touchpoints | Camada de repositórios com testes + 144 testes baseline |
| Conflitos de sync | `_lastUpdated`/`_version` + reconciliação de fila offline |
| Segurança/RLS no Supabase | RLS por `tenant_id`, service role só no backend |
| SQLite nativo instável no APK | Dual-write + flag + rollback `.dat` |
| OPFS/Safari no browser (Fase 4) | Manter Dexie como fallback (benefício da Fase 1) |

---

## 7. Arquivos-chave (mapa de impacto)

- `src/services/sqliteService.ts` — banco Dexie + proxy `sqliteService` (lazy singleton)
- `src/services/localDbService.ts` — operações locais (`localDb`)
- `src/services/supabaseService.ts` — ~30 funções cloud prontas (`isInternalMode = true`)
- `src/services/DatabaseLoaderService.ts` — carga de planilhas em lotes
- `src/services/persistenceService.ts`, `backupService.ts`, `FileSystemStorageService.ts` — backup/restore
- `src/constants/schema.ts` — dicionário de colunas (mapeamento de importação)
- `docs/ANALISE_TABELAS_ATIVOS_ASSETS.md` — análise DBA da redundância das tabelas-espelho
  (canônica `assets`, baseline `local_assets`, `ativos` legado) — pendência pós-export
- `docs/CORRECAO_INVENTORYCARD_MODULO_ATIVO.md` — correção `InventoryCard` ↔ `Inventory`
  (card no módulo ATIVO IMOBILIZADO; `Inventory.tsx` no fluxo de inventário; conexões
  com a tabela de trabalho `assets`) — pendência de UI registrada 2026-08-06
- `vite.config.ts` — assets wasm já copiados (sql.js); `optimizeDeps.exclude` já pronto
- `src/types.ts` — `DatabaseMode`, `AppScreen`, `User`
