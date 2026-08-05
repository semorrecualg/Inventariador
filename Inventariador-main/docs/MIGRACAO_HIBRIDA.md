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
| Persistência real | 100% **Dexie/IndexedDB** — banco `InventoryLocalStore` (schema v3) |
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
- [ ] **Corrigir typecheck** (pendência 1 da issue #6): workbox, rollup, @tailwindcss/vite,
      vite-plugin-pwa, tsconfig TS6310 — baseline limpo antes de mover 292 pontos.
- [ ] Congelar o **schema atual** (snapshot das 9 tabelas Dexie + `schema.ts`).
- [ ] **Export de segurança** completo: JSON (`persistenceService`/`backupService`) + `.dat`
      físico + contagem por tabela (checksum) — armazenado fora do app.
- [ ] Testar **backup → restore** de ponta a ponta (critério de aceite da Fase 0).
- **Critério de aceite:** `tsc` limpo em `src/`; 103 testes verdes; restore validado.
- **Risco:** baixo. **Rollback:** n/a (não altera runtime).

### Fase 1 — Camada de Repositórios (abstração)
- [ ] Criar `src/repositories/`: `AssetRepository`, `AuditRepository`, `CampaignRepository`,
      `UnitRepository`, `ContextRepository` — interface única por domínio.
- [ ] Implementar 1º backend = **Dexie** (delega para `localDb`/`db` atuais, comportamento idêntico).
- [ ] Migrar os **292 touchpoints** para os repositórios (telas/serviços não tocam mais em `db.*` direto).
- [ ] Testes de repositório (mock do backend) + 103 testes existentes verdes.
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

- **Primeiro:** pendência 1 da issue #6 (typecheck limpo) — Fase 0.
- **Depois:** demais correções pequenas da issue #6 (independentes da migração).
- **Em paralelo/sequencial:** Fase 1 (repositórios) pode coexistir com correções de UI,
  pois não muda comportamento.
- **Não misturar:** Fases 2–3 (Supabase/SQLite) entram com o baseline estável, testes verdes
  e plano de rollback em mãos.

---

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Perda de dados na migração | Export+checksum, dry-run, idempotência, restore testado |
| Regressão nos 292 touchpoints | Camada de repositórios com testes + 103 testes baseline |
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
- `vite.config.ts` — assets wasm já copiados (sql.js); `optimizeDeps.exclude` já pronto
- `src/types.ts` — `DatabaseMode`, `AppScreen`, `User`
