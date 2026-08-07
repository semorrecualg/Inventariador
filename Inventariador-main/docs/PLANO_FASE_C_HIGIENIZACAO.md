# Plano da Fase C — Padronização de Chaves/Valores UPPER → Canônico Minúsculo

> **Status:** EXECUÇÃO — C1 entregue (helpers + `CANONICAL_KEY_MAP` + loader M1) · **C2 entregue**
> (Classe T no loader — 3 caminhos); decisões §9 aprovadas em 2026-08-07 (migração version(5)
> com dry-run · flag `NORMALIZE_ON_UPGRADE` · `status` preserva caixa · 2 PRs). C3+ pendentes.
> **Data:** 2026-08-06 (plano) · C1: 2026-08-07 · **Projeto:** GBR KARDEK v24.50-PROD (Inventariador v2.6.0)
> **Base:** auditoria estrutural fechada em `docs/HIGIENIZACAO_ENDERECO.md` (§6.4/§6.6/§6.7):
> `public.assets` = 26 colunas 100% canônicas (sem ação) · `staging.assets` = schema morto
> (fora de escopo, Fase D) · **~700 ocorrências de chaves UPPER** em 40+ arquivos do `src/`.
> **Alinhamento:** `SYSTEM_INSTRUCTIONS.md` (SRE, trava de validação) · contrato de risco zero.

---

## 0. Objetivo e princípios

Padronizar o **ecossistema do app** para o canônico minúsculo (`endereco`, `etiqueta`, …),
eliminando a dupla grafia estrutural (D1) e a normalização assimétrica (D2) — **sem tocar no
schema do Supabase** (`public` = 26/26 canônicas, no-op confirmado) e **sem perda de dados**.

Princípios:
1. **Risco zero:** nenhuma indisponibilidade; compatível com dados existentes no Dexie.
2. **Incremental por classe:** Classe K primeiro (regra aprovada), depois T/N/D/F.
3. **Idempotente:** a migração pode rodar N vezes com o mesmo resultado.
4. **Transição tolerante:** leitura híbrida (`ENDERECO || endereco`) mantida DURANTE a Fase C,
   removida só na C5 (varredura final) — nunca em salto único.
5. **Gate de qualidade em toda subfase:** `tsc -b --noEmit` + `vitest run` + contrato baseline.

## 1. Estratégia em 2 movimentos

| Movimento | O quê | Onde | Quando |
|---|---|---|---|
| **M1 — Valores** | Normalizar o **valor** de Classe K na **carga** (`UPPER + TRIM + expurgo [^A-Z0-9-]` — regra aprovada) e na **escrita** (edição/reconciliação) | `DatabaseLoaderService`, `App.tsx` (gravação), `Inventory.tsx` | C1 |
| **M2 — Chaves** | Padronizar as **chaves de objeto/payload** UPPER → canônico minúsculo, com getter tolerante central | ~40 arquivos (runtime/UI/services) | C1→C4 |

M2 é o grosso do trabalho (~700 ocorrências) e deve ser conduzido por um **helper central de
acesso** (abaixo) para não quebrar leituras durante a transição.

### 1.1 Novos helpers (módulo `src/utils/normalize.ts` — reutilizar padrões existentes)

```ts
// Regra aprovada Classe K (alinhada a addressParser.ts:15 / persistenceService.ts:200)
export function normalizeClassK(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}
// Classe T: preservar caixa, colapsar espaços
export function normalizeClassT(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).trim().replace(/\s+/g, ' ');
}
// Leitura tolerante durante a transição (canônico vence, UPPER é fallback)
export function pickCanonical(rec: Record<string, unknown>, lowerKey: string): unknown {
  const upper = lowerKey.toUpperCase();
  return rec[lowerKey] ?? rec[upper] ?? null;
}
```

- `pickCanonical` substitui as ~15 ocorrências de `toUpperCase().trim()` espalhadas e as 2
  leituras híbridas (`App.tsx:1893`, `Inventory.tsx:639`).
- Na **C5** (fim), `pickCanonical` pode ser removido e as leituras passam a ser diretas.

## 2. Escopo por classe (matriz do §6.4 + novos dados)

| Classe | Campos (canônicos) | Regra | Ocorrências UPPER (src/) |
|---|---|---|---|
| **K — código/chave** | `filial, etiqueta, tag, primarykey, registro, subreg, contacontabil, centrodecusto, cnpj, notafiscal, serial, endereco, dataaqusic, databaixa, vlraquisic, sn1_recno, sn3_recno` | `UPPER+TRIM+[^A-Z0-9-]` ✅ aprovada | **~566** |
| **T — texto descritivo** | `descricaodoativo, nomefornecedor, status` (+ `_history, DE_PARA`) | TRIM + colapso, **preservar caixa** | ~134 (71+16+47) |
| **N — numérico** | `qt, vlraquisic, sn1_recno, sn3_recno` (+ `gps_lat/lng`) | parse/coerce numérico | pequena |
| **D — data** | `dataaqusic, databaixa` | normalizar formato | pequena |
| **F — flags 0\|1** | `_is_synced, _is_deleted, _conferido, _plaquetado, _aprovado, _isNew, _is_unitized, _is_divergent_baixa` | `Number(x) === 1` | pequena |

> ⚠️ A contagem UPPER inclui ~14 sinônimos **legítimos** do dicionário de importação
> (`DB_ASSET_COLUMNS`/`SCHEMA_PRIORITY` em `constants/schema.ts`) — esses NÃO são alterados;
> são a camada de tradução cabeçalho-Excel → canônico.

## 3. Subfase C1 — Classe K (arquivos e alterações)

### 3.1 Arquivos com maior superfície (alteração obrigatória em C1)

| Arquivo | O que muda | Referência de chaves UPPER |
|---|---|---|
| `src/constants/schema.ts` | Adicionar `CANONICAL_KEY_MAP` (UPPER→lower) + garantir os 21 canônicos lower (já existem); **manter** `DB_ASSET_COLUMNS`/`SCHEMA_PRIORITY` intactos (dict de importação) | ETIQUETA, REGISTRO, DESCRICAODOATIVO, VLRAQUISIC, DATAAQUSIC, CENTRODECUSTO, SERIAL, CNPJ, NOMEFORNECEDOR, NOTAFISCAL, ENDERECO, STATUS, DATABAIXA, Sn1/Sn3_recno |
| `src/types.ts` | `DexieAsset`: chaves canônicas lower + campos legados `[key: string]: unknown` (ou interface estendida) para não quebrar objetos com UPPER | tipos dos 20 campos |
| `src/services/DatabaseLoaderService.ts` | **M1:** aplicar `normalizeClassK` nos valores K na carga (hoje só `.trim()` — linha ~618); manter alias de cabeçalho (~178-182, 351); `tenantid` na posição 0 (linha 64) | contrato 21 |
| `src/App.tsx` | Substituir chaves UPPER em: `editableFields` (219), form states (725/741), leitura híbrida (1893/1899), gravação (4220-4223), reconcialiação (4835-4838), delta de auditoria (4870-4873), `AUDITOR_*` (4998-5000), `uniqueEnderecos` (6244) — usar `pickCanonical`/canônicas | ENDERECO + vizinhos (filial/unidade, 1801/4003/5219…) |
| `src/components/AssetDetail.tsx` | Payload de edição (463) → lower; sugestões `uniqueEnderecos` (505-506) → `pickCanonical`; exibição DE/PARA (667-1109) | ENDERECO, ETIQUETA, SERIAL, VLRAQUISIC… |
| `src/components/Inventory.tsx` | Leitura híbrida (639) → `pickCanonical`; gravação (748/761) → lower | ENDERECO |
| `src/components/ActiveSearch.tsx` | Filtro/agrupamento (40-202) → `pickCanonical` | ENDERECO |
| `src/components/AssetMap.tsx` | Filtro/mapa (116-398) → `pickCanonical` | ENDERECO, VLRAQUISIC |
| `src/components/Dashboard.tsx` | `AUDITOR_*` (420-422) | ENDERECO |
| `src/services/reportService.ts` | Payload de relatório (20) → lower | ENDERECO |
| `src/utils/qrUtils.ts` | Campos do QR (25) → lower | ENDERECO, ETIQUETA, REGISTRO… |
| `src/stores/inventoryStore.ts` | `editableFields` (102) → lower | DESCRICAODOATIVO, SERIAL, ENDERECO |
| `src/services/supabaseService.ts` | `mapColumnName`: **garantir cobertura** dos canônicos lower do contrato (hoje cobre `_unitid`→`filial` e tenant); **nada muda no schema public** | PRIMARYKEY, SUBREG, CNPJ… |
| `src/services/{tagService,protheusService,depreciationService,stressTestService,demoSeed,reportGenerator,persistenceService,addressParser}.ts` | Alinhar payloads/escritas ao lower (reutilizando helpers) | vários |

### 3.2 Arquivos de leitura/UI (C1 também, mas baixo risco — via `pickCanonical`)

`AssetListItem` (63/138) · `AssetPrintView` (183) · `Consultation` (268) · `AssetLedger` ·
`AccountReconciliation` · `AssetControlModule` · `AssetUnitizeModal` · `InventoryCard` ·
`Labeling` · `PublicKardex` · `Signature` · `TrustOnboarding` (21 — lista UPPER vira lista
canônica) · `FieldConfigurator` (37 — label) · `BiometricRegistration` · `MainMenu` ·
`GPSComplianceGuard` · `AuditLogs` · `SoftDeleteReport` · `ImpairmentReport` ·
`ImpairmentTestModal` · `UnitConfigurator` · `securityExport.test.ts` (ajuste de expectativa).

### 3.3 Ordem dentro da C1 (top-down para não quebrar)

1. `utils/normalize.ts` (helpers) → 2. `constants/schema.ts` (`CANONICAL_KEY_MAP`) →
3. `types.ts` → 4. `DatabaseLoaderService` (M1 valores) → 5. `App.tsx` (gravação/edição) →
6. components de escrita (`Inventory`, `AssetDetail`) → 7. serviços de payload
(`reportService`, `qrUtils`, `tagService`, `supabaseService.mapColumnName`) →
8. componentes de leitura (`pickCanonical` em massa).

### 3.4 Notas de execução C1 (2026-08-07)

Entregue nesta subfase: `src/utils/normalize.ts` (helpers + `normalizeFieldValue`
por classe + flag `NORMALIZE_ON_UPGRADE`) · `CANONICAL_KEY_MAP` em
`constants/schema.ts` · M1 nos 3 caminhos de carga do `DatabaseLoaderService`
(`injetarDadosEmLotes`, `processExcelFile`, `importExcelBulkData`) · testes
`normalize`/`pickCanonical`/`loaderNormalization`.

Desvios SRE documentados (proteção de dados — contrato de risco zero):

1. **`filial` NÃO recebe o expurgo `[^A-Z0-9-]`:** nomes físicos com espaço
   ("010101 CICOPAL GO") são vinculados a `unit_configs`/stats por match de
   string com espaço; regra aplicada = `UPPER + TRIM` (idêntica ao
   comportamento atual do loader). O expurgo da classe K permanece para os
   campos de código: `endereco, serial, registro, subreg, contacontabil,
   centrodecusto, cnpj, notafiscal`.
2. **Identidade/PK (`etiqueta`, `tag`, `primarykey`) NÃO é normalizada na C1:**
   são a chave primária do Dexie (`id`); alterá-las na carga recriaria
   registros duplicados em re-carga. Política a definir na C4 (version(5)) —
   `modify` do Dexie não altera pk, logo a normalização de `etiqueta` exige
   decisão explícita (normalizar o valor mantendo `id` imutável).
3. **Consequência do expurgo nos campos de código:** "SEM CONTA" →
   "SEMCONTA", "1.2.3.4" → "1234", "12.345.678/0001-90" → "123456780001-90".
   Consistente com a regra aprovada e com a cadeia canônica existente
   (`addressParser`/`persistenceService`); a C4 normalizará os dados
   existentes com a MESMA regra. Recomenda-se rodar a query (b) de
   `docs/HIGIENIZACAO_ENDERECO.md` (amostra DISTINCT por campo) antes da C4
   para confirmar o formato canônico por campo.

## 4. Subfase C2 — Classe T (texto descritivo)

- `descricaodoativo`, `nomefornecedor`, `status` (enum): `normalizeClassT` na carga e na
  escrita (TRIM + colapso de espaços, **caixa preservada** — regra oposta à K por decisão).
- `_history`, `DE_PARA`: preservar integralmente (nunca normalizar conteúdo histórico).
- Arquivos: `DatabaseLoaderService`, `App.tsx`, `AssetDetail`, `Consultation`, `Labeling`,
  `PublicKardex`, `reportService`.

### 4.1 Notas de execução C2 (2026-08-07)

Entregue — Classe T na **carga**: `DatabaseLoaderService` (3 caminhos: `injetarDadosEmLotes`,
`processExcelFile`, `importExcelBulkData`) roteia `status`, `descricaodoativo` e
`nomefornecedor` por `normalizeFieldValue('…', …)` (regra T: TRIM + colapso de espaços,
**caixa preservada** — decisão §9.3). `?? fallback` mantém `status`/`descricaodoativo`
não-nulos (contrato `DexieAsset.status/descricaodoativo: string`); `nomefornecedor` vazio →
`null` (semântica idêntica à atual `|| null`).

Pendente — escrita de campos T em `App.tsx`/`AssetDetail`/`Labeling`/`reportService` ainda usa
chaves UPPER (`DESCRICAODOATIVO`, `NOMEFORNECEDOR`, `STATUS`); a normalização de **valor** T
esses paths entra junto com a varredura de **chaves** (M2 — C1→C4), para não criar estado
híbrido. `_history`/`DE_PARA` permanecem intocados.

Gate C2: `tsc -b --noEmit` ✓ · `vitest run` 165/165 ✓.

## 5. Subfase C3 — N/D/F (coerções)

- **N:** `qt`, `vlraquisic`, `sn1_recno`, `sn3_recno` — parse numérico com fallback seguro
  (`Number(x)` + validação; valor inválido mantém-se como `null` e registra aviso — nunca
  `NaN` no banco). Alinhar `sn1/sn3_recno` integer (public) no caminho de sync.
- **D:** `dataaqusic`, `databaixa` — normalizar para `YYYY-MM-DD` quando parseável (padrão ISO);
  não-parseável preservado.
- **F:** flags — `coerce Number(x) === 1` em toda leitura de flag (zero lógica case).
- Arquivos: `DatabaseLoaderService`, `App.tsx` (updates), `depreciationService`, `reportService`.

## 6. Migração Dexie `version(5)` idempotente (dry-run primeiro)

Contexto (contrato v4 congelado em `schemaBaseline.test.ts`): `InventoryLocalStore`, verno 4,
9 tabelas (`local_assets, ativos, assets, audit_logs, campaigns, SYSTEM_CONTEXT, unit_configs,
campaign_snapshots, addresses`), assinaturas congeladas (ex.: assets = `primarykey,
[tenantid+filial], filial, _is_synced`).

### 6.1 Spec da migração

```ts
db.version(5).stores(/* MESMAS assinaturas do v4 — sem mudança estrutural */).upgrade(async (tx) => {
  // (1) Normaliza valores Classe K/T em assets, local_assets e ativos (triple-write)
  for (const tbl of ['assets', 'local_assets', 'ativos']) {
    await tx.table(tbl).toCollection().modify((a) => {
      // K: endereco, etiqueta, serial, registro, subreg, centrodecusto, contacontabil,
      //     cnpj, notafiscal, nomefornecedor? (T), dataaqusic (D), databaixa (D),
      //     vlraquisic (N), filial, primarykey, tag
      // Somente grava quando o valor mudou → idempotente (modify só persiste se alterar)
    });
  }
  // (2) Regenera addresses (codigo_endereco derivado) a partir dos ativos normalizados
  //     — mesma lógica de localDbService.getLocationsWithStats (317-345)
  // (3) Sem DROP/renome de tabela/coluna — garantia de zero perda e rollback via transação
});
```

Regras de idempotência/dry-run:
- **Dry-run:** executar contra um clone do banco (ou `db.backendDB()` aberto em memória) e
  emitir relatório: contagem por tabela, checksum (soma/hash de `endereco`+`etiqueta`+…)
  **antes/depois**, e nº de registros alterados.
- **Idempotência:** `modify` só persiste quando o valor muda; rodar 2× → 0 alterações na 2ª.
- **Flag de segurança:** `NORMALIZE_ON_UPGRADE=false` permite pular a etapa de dados e manter
  apenas a mudança de código (rollback instantâneo).
- **Não muda índices** → nenhum re-index; **verno 4 → 5** exige atualização do
  `schemaBaseline.test.ts` (`expect(db.verno).toBe(5)`) e do `docs/SCHEMA_BASELINE.md`.

### 6.2 Testes da migração (novos)

- `migrationV5.test.ts`: (a) banco v4 com dados "sujos" → upgrade → valores K normalizados;
  (b) roda 2× → idempotente; (c) dados T preservam caixa; (d) dry-run não grava; (e) checksum
  antes/depois coerente.

## 7. Sync Supabase (public = no-op)

- **Nenhuma DDL no `public`** (26/26 canônicas confirmadas — §6.7 do relatório).
- `supabaseService.mapColumnName`: revisar para cobrir todos os canônicos lower do contrato
  (hoje cobre `_unitid`→`filial` e tenant); escrever sempre lower; ler com tolerância
  (`pickCanonical`) durante a transição.
- Após C5, o payload de sync será 1:1 com o shape do `public.assets` (26 colunas).

## 8. Gate de testes e validação (por subfase)

| Gate | Comando | Observação |
|---|---|---|
| Typecheck | `npx tsc -b --noEmit` (ou `npm run build` em CI) | — |
| Testes | `npx vitest run` | 144 existentes + novos |
| Contrato | `schemaBaseline.test.ts` atualizado (verno 5) | baseline v4 → v5 com justificativa no doc |
| Novos testes | `normalize.test.ts` (K/T), `pickCanonical.test.ts`, `loaderNormalization.test.ts`, `migrationV5.test.ts`, `mapColumnName.test.ts` | regras por classe |
| Varredura final | `grep -rwE 'ETIQUETA|ENDERECO|…' src/` **fora** de `schema.ts` (dict) → deve cair a ~0 na C5 | aceitável: strings de label/UI |

Sequência de execução por subfase: **C1 → gate → C2 → gate → C3 → gate → C4 (version(5) +
sync) → gate → C5 (remoção da tolerância + varredura final) → gate final**.

## 9. Decisões de contrato pendentes (destravam a execução)

1. **Dados existentes no Dexie:** aprova a migração `version(5)` com dry-run (recomendado —
   idempotente, zero perda) ou somente código novo (dados antigos ficam como estão)?
2. **Rollout:** liberar com flag `NORMALIZE_ON_UPGRADE` (recomendado) ou migração única?
3. **`status` (T):** confirmar que o valor canônico do enum (`PENDENTE`/`CONFERIDO`/…) deve
   manter caixa (recomendado) — não entra na regra K.
4. **Cronograma:** execução em 1 PR grande (recomendado: 2 PRs — C1/C2/C3 e C4/C5) ou por
   arquivo?

## 10. Fora de escopo (explícito)

- **Supabase `staging`** (Fase D — decisão de destino pendente: congelar/drop/recriar).
- **Schema `public`:** nenhuma DDL (no-op definitivo).
- **Colunas novas** no `public` (ex.: campos do shape DexieAsset não espelhados — avaliar em
  auditoria de sync separada).
- **Dados fora do app** (planilhas, pipelines externos) — higienização é responsabilidade do
  loader/import.

---

**Nenhum arquivo de código foi alterado nesta etapa.** Este documento é o contrato de execução
da Fase C; a implementação começa somente após as decisões do §9 e revisão.
