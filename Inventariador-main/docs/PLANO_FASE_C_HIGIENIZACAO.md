# Plano da Fase C — Padronização de Chaves/Valores UPPER → Canônico Minúsculo

> **Status:** EXECUÇÃO — C1 entregue (helpers + `CANONICAL_KEY_MAP` + loader M1) · **C2 entregue**
> (Classe T no loader — 3 caminhos) · **C3 entregue** (N/D/F: `normalizeNumeric`/`normalizeDateISO`/
> `normalizeFlag` no loader e leituras tolerantes) · **M2 concluído** (varredura de chaves em ~40
> arquivos — ver §5.2); decisões §9 aprovadas em 2026-08-07 (migração
> version(5) com dry-run · flag `NORMALIZE_ON_UPGRADE` · `status` preserva caixa · 2 PRs).
> **C4 entregue em 2026-08-07** (migração `version(5)` idempotente + dry-run + sync §7 — ver §6.3) ·
> **C5 concluída em 2026-08-07** (remoção da tolerância híbrida + bloco de fallback UPPER de
> escrita + varredura final — ver §8.1). **Fase C concluída.**
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

### 5.1 Notas de execução C3 (2026-08-07)

Entregue:
- **N:** `normalizeNumeric` (válido/finito → número; inválido/vazio → `null` — nunca `NaN`)
  aplicado a `sn1_recno`/`sn3_recno` nos 3 caminhos do loader. `qt`/`vlraquisic` mantêm os
  fallbacks já existentes (`1`/`0`) por serem não-nulos no contrato `DexieAsset`. Sync
  `supabaseService` já alinhado (qt/vlr `isNaN`→fallback; sn `''`/inválido→`null`) — sem ação.
- **D:** `normalizeDateISO` (`dd/mm/yyyy`, `dd-mm-yyyy` ou ISO → `YYYY-MM-DD`; round-trip
  validado — `31/02/2023` preservado; não-parseável preservado — contrato risco zero)
  aplicado a `dataaqusic`/`databaixa` nos 3 caminhos do loader. `depreciationService` passou a
  ler via `pickCanonical('dataaqusic')` — o ISO chega ao `new Date()` (corrige parse de
  `31/12/2024`, que hoje vira `Invalid Date`).
- **F:** `normalizeFlag` (unifica `0|1`, `true|false` e strings `'1'/'0'/'true'/'false'`)
  aplicado a 11 leituras em `App.tsx` (`_conferido`, `_is_deleted`, `_plaquetado`). Escritas
  permanecem como estão (loader `0|1`; App booleans) — a leitura tolera ambas (sem quebrar
  `=== true` existentes).
- `reportService`: sem coerção C3 necessária (payload é leitura; chaves UPPER = varredura M2).

Gate C3: `tsc -b --noEmit` ✓ · `vitest run` 165 + novos ✓.

### 5.2 Notas de execução M2 — varredura de chaves (parcial: App.tsx + AssetDetail.tsx, 2026-08-07)

Varredura mecânica sintaxe-aware iniciada (2 dos ~40 arquivos; ~115 ocorrências convertidas):

- **Transformação (3 regras, allowlist = 22 chaves de coluna do `CANONICAL_KEY_MAP` ∩ `DexieAsset`):**
  acesso de membro (`.ETIQUETA` → `.etiqueta`), index (`['ENDERECO']` → `['endereco']`) e chave de
  literal de objeto (`ETIQUETA:` → `etiqueta:`). App.tsx: r1=46 · r2=2 · r3=18. AssetDetail: r1=26.
- **Preservados (contratos/runtime — NÃO convertidos):** valores UPPER de `editableFields`/
  `qrCodeFields`/`QR_FIELD_ORDER`; comparações `=== 'ETIQUETA'`/`'DATAAQUISIC'`/`'CENTRODECUSTO'`;
  chaves de runtime `TAG_INVENTARIO`/`PLAQUETA`/`TAG`/`AUDITOR_STATUS_CONFERENCIA`/`DE_PARA`
  (fora da allowlist; `CANONICAL_KEY_MAP` mapeia `TAG_INVENTARIO→tag`, mas o sweep NÃO converte —
  semântica de runtime difere da coluna staging).
- **Leituras tolerantes novas (dados antigos UPPER × novos lower):** display do AssetDetail via
  `pickCanonical(workingAsset, canonicalKey(key))`; builder de QR idem; `_valoresOriginais` lido nas
  duas grafias (`canonicalKey(key)` ?? `key`); payload de QR público (`decoded`) via `pickCanonical`.
- **Escritas dinâmicas canonicalizadas (AssetDetail):** `updates[canonicalKey(ocrTargetField|field|editingField)]`
  e `finalAsset[canonicalKey(editingField)]` — o valor UPPER do contrato vira chave canônica no ativo.
- **Consistência (App.tsx):** `alteredFields.add('endereco')` e `originalValues['endereco']`
  acompanham as chaves reais canônicas (`_camposAlterados`/`_valoresOriginais` espelham o ativo).
- **Correções de revisão:** revert `TYPE_LABELS.serial` (constante de UI com chaves UPPER — falso
  positivo da regra de membro); `child.vlraquisic = Number(splitVlr.toFixed(2))` (contrato tipado
  `number`); limpeza de redundância `a.filial || a.filial` (UNIDADE→filial em 3 sites).
- **⚠ Dependência crítica:** leituras diretas canônicas (`a.etiqueta`) dependem da migração **C4
  version(5)** no MESMO PR — dados existentes UPPER retornam `undefined` na UI até a migração rodar
  (leituras híbridas residuais: ver C5).
- **Pendências:** ~38 arquivos restantes (Labeling, Consultation, PublicKardex, reportService,
  supabaseService, stores, serviços de QR/export…). Labeling lê `_valoresOriginais[field]` com
  `field` de `_camposAlterados` (misto durante a transição) — tratar na sequência M2.

### 5.3 Notas de execução M2 — varredura continuada (2026-08-07, ~38 arquivos)

Varredura concluída nos arquivos restantes (~560 ocorrências; regras r1/r2/r3 do §5.2):

- **Serviços/utils:** `supabaseService` (filtros `.eq/.in('etiqueta')` no schema public;
  payloads de sync já canônico-primeiro), `reportService`, `tagService`, `protheusService`
  (inclusive `sn1/sn3_recno` lower + `?? undefined`), `demoSeed`, `stressTestService`,
  `reportGenerator`, `persistenceService`, `geminiService` (`a.filial` no lugar de `a.UNIDADE`),
  `auditService`, `depreciationService` (cadeia `vlraquisic || VLRAQUISIC`).
- **Infra de leitura:** `localDbService.where()` passou a ler via `pickCanonical` (busca por
  `etiqueta` funciona para dados UPPER e lower); `assetRepository` alinhou os nomes de campo do
  wrapper (`where('etiqueta')`, `[etiqueta+filial]`). ⚠ **Achado SRE pré-existente:** o ramo de
  array do wrapper consulta o índice `[tenantid+filial]` com `[etiqueta, unidade]` — nunca casa;
  `findByEtiquetaInUnit` está inoperante. Fora do escopo M2 — follow-up na C4 (índice composto
  ou filtro em memória). ✅ **Resolvido em §8.2** (filtro em memória).
- **Componentes:** `Inventory`, `AccountReconciliation`, `Consultation`, `AssetControlModule`,
  `ActiveSearch`, `Labeling`, `Dashboard`, `AssetMap`, `PublicKardex`, `ImpairmentReport`,
  `AssetListItem`, `AssetPrintView`, `AssetLedger`, `SoftDeleteReport`, `Signature`,
  `ImpairmentTestModal`, `AssetUnitizeModal`.
- **Ajustes de contrato:** `Consultation` QR builder → `pickCanonical(asset, canonicalKey(field))`
  (mesmo padrão do AssetDetail); `FieldConfigurator` casa o mapa de labels via `canonicalKey`
  (assets canônicos × contrato UPPER `editableFields`); `TrustOnboarding` template Carga Expert
  com cabeçalhos canônicos (`tenantid, filial, status, etiqueta, …`).
- **Preservados (documentado):** `SearchFilters`/`types.ts` + `uiStore` (contrato de filtro
  UPPER); valores de `editableFields`/`qrCodeFields`/`QR_FIELD_ORDER`; strings de comparação
  atadas a esses contratos; runtime `TAG_INVENTARIO`/`TAG_DUPLICIDADE`/`DE_PARA`/`AUDITOR_*`/
  `ESTADO_CONSERVACAO`/`GRUPO_EMPRESARIAL`; fallbacks legados `_unitid`/`UNIDADE`
  (SoftDeleteReport híbrido canônico-primeiro).
- **Tolerância residual REMOVIDA na C5 (§8.1):** cadeias canônico-primeiro
  (`a.vlraquisic || a.VLRAQUISIC`, `cleanAsset.status || cleanAsset.STATUS`), o bloco de
  fallback UPPER de escrita do `utils/schema.ts` e os `pickCanonical` de leitura de dados
  locais (migrados pela C4).
- **Residuais conhecidos:** `supabaseService:2058` `.in('ETIQUETA', …)` (linha fora do alcance
  do editor nesta sessão — alinhar na C5) e `.eq('TAG_INVENTARIO')` (coluna inexistente no
  `public` — pré-existente, follow-up C4).
- **Nota de ferramenta:** a camada de edição sincronizada corrompeu `Inventory.tsx` (dublagem de
  fragmentos) — arquivo restaurado via `git checkout` e re-convertido deterministicamente;
  nenhum dado de usuário foi afetado (arquivo sem alterações pré-existentes).

Gate M2 (completo): `tsc -b --noEmit` ✓ · `vitest run` 173/173 ✓.

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

### 6.3 Notas de execução C4 — migração `version(5)` (2026-08-07)

Entregue:

- **`src/services/migrationV5.ts`** (novo módulo, testável sem Dexie):
  - `normalizeAssetRecordV5` — primitivo puro: (1) reescreve chaves UPPER → canônico
    (allowlist `CANONICAL_KEY_MAP` ∩ `DexieAsset`, com **exclusões**: `PRIMARYKEY` — PK imutável —
    e runtime `TAG_INVENTARIO`/`DE_PARA`/`ESTADO_CONSERVACAO`/`GRUPO_EMPRESARIAL`/`AUDITOR_*`,
    mesma política da varredura M2 §5.2/§5.3); (2) normaliza valores por classe via
    `normalizeFieldValue` (MESMO primitivo do loader M1), mais N (`normalizeNumeric`),
    D (`normalizeDateISO`) e F (`normalizeFlag` → `0|1` numérico, contrato DexieAsset).
  - `runV5Upgrade(tx)` — runner da etapa de dados; semântica correta do `modify` Dexie v4
    (**retorna `false` quando nada muda** → zero escritas na 2ª execução; muta o clone in-place).
  - `runMigrationV5DryRun(source)` — **somente leitura**: relatório por tabela (count/changed/
    fieldsChanged), checksum determinístico antes/depois (`assetChecksum`, ordem fixa de campos)
    e verificação de idempotência (2ª passada em memória → 0 alterações).
  - `reconcileAddresses(tx)` — reconcile **aditivo** de `addresses` a partir dos ativos
    normalizados (assets canônica; fallback local_assets — espelha `getLocationsWithStats`);
    nunca apaga linhas existentes (zero perda; ids auto preservados).
- **`src/services/sqliteService.ts`** — `version(5)` com **MESMAS assinaturas do v4** (sem
  mudança estrutural); upgrade condicionado à flag `NORMALIZE_ON_UPGRADE` (decisão §9.2);
  exporta `runMigrationV5DryRun()` (wrapper sobre o banco real).
- **Sync Supabase (§7):** `mapColumnName` verificado — cobertura estrutural completa (o
  pass-through de colunas minúsculas já é 1:1 com o `public` 26/26 canônico; mapeia apenas
  aliases legados `_unitid`/`unit_id`/`unitid` → `filial`). **Corrigido** o residual
  `supabaseService:2058` `.in('ETIQUETA', …)` → `.in('etiqueta', …)` (coluna real do `public`).
- **Resolve a dependência crítica §5.2:** dados legados UPPER agora são reescritos para o
  canônico na migração — leituras diretas canônicas (`a.etiqueta`) passam a funcionar.
- **Testes (§6.2):** `migrationV5.test.ts` (6 testes: upgrade sujo → canônico; idempotência 2×;
  T preserva caixa; dry-run não grava; checksum coerente; flag `enabled=false`; reconcile
  aditivo de addresses). `schemaBaseline.test.ts` atualizado para `db.verno === 5`.

Gate C4: `tsc -b --noEmit` ✓ · `vitest run` 179/179 ✓ (6 novos).

> **Nota (2026-08-12):** após a Fase C, o schema evoluiu para **v7** (muro multi-tenant:
> chave composta `[tenantid+primarykey]` nas 3 tabelas de ativos — ver
> `docs/SCHEMA_BASELINE.md` §1). O `version(5)` descrito aqui continua como etapa
> histórica da cadeia v1→v7; o baseline vigente é `db.verno === 7`.

Pendências pós-C4 (C5): **resolvidas em §8.1** (tolerância híbrida removida + varredura
final), **§8.2** (`findByEtiquetaInUnit` corrigido) e **§8.3** (`.eq('TAG_INVENTARIO')`
alinhado ao contrato do `public`). Sem achados SRE pendentes na Fase C.

## 7. Sync Supabase (public = no-op)

- **Nenhuma DDL no `public`** (26/26 canônicas confirmadas — §6.7 do relatório).
- `supabaseService.mapColumnName`: revisar para cobrir todos os canônicos lower do contrato
  (hoje cobre `_unitid`→`filial` e tenant); escrever sempre lower; ler com tolerância
  (`pickCanonical`) durante a transição.
- Após C5, o payload de sync será 1:1 com o shape do `public.assets` (26 colunas).

### 7.1 Status C4 (2026-08-07)

- **`mapColumnName` verificado** — cobertura estrutural completa: para `assets`/`assets_analytics`
  mapeia apenas aliases legados (`_unitid`/`unit_id`/`unitid` → `filial`); todo o restante é
  pass-through — como o `public` é 26/26 canônico minúsculo, qualquer coluna lower do contrato
  já casa 1:1 (sem mapeamento adicional necessário). Escritas sempre lower (M2) e leituras
  tolerantes via `pickCanonical` durante a transição — sem ação remanescente.
- **Residual corrigido:** `supabaseService:2058` `.in('ETIQUETA', …)` → `.in('etiqueta', …)`
  (coluna real do `public`; a forma UPPER retornava PGRST204 no sync).
- **Achado pré-existente RESOLVIDO em §8.3:** `.eq('TAG_INVENTARIO')` referenciava coluna
  inexistente no `public` — filtro realinhado ao contrato (derivação por `status`+`databaixa`).

## 8. Gate de testes e validação (por subfase)

| Gate | Comando | Observação |
|---|---|---|
| Typecheck | `npx tsc -b --noEmit` (ou `npm run build` em CI) | — |
| Testes | `npx vitest run` | 144 existentes + novos |
| Contrato | `schemaBaseline.test.ts` atualizado (verno 5) | baseline v4 → v5 com justificativa no doc |
| Novos testes | `normalize.test.ts` (K/T), `pickCanonical.test.ts`, `loaderNormalization.test.ts`, `migrationV5.test.ts`, `mapColumnName.test.ts` | regras por classe |
| Varredura final ✅ | `grep -rwE 'ETIQUETA|ENDERECO|…' src/` **fora** de `schema.ts` (dict) → **~0** (§8.1) | residual aceito: leituras de entrada do `normalizeAssetContract` (gateway de ingestão) + strings de label/UI |

Sequência de execução por subfase: **C1 → gate → C2 → gate → C3 → gate → C4 (version(5) +
sync) → gate → C5 (remoção da tolerância + varredura final) → gate final**.

### 8.1 Notas de execução C5 — remoção da tolerância híbrida + varredura final (2026-08-07)

Fase C concluída. Entregue:

- **Leituras diretas canônicas** (dados locais migrados pela C4 — `pickCanonical` removido):
  `localDbService.where()` (2 sites), `depreciationService` (`dataaqusic`), `AssetDetail`
  (display + DE/PARA), `Consultation` (builder de QR). Imports órfãos removidos.
- **Cadeias canônico-primeiro removidas** (fallback UPPER de mesmo campo): `vlraquisic ||
  VLRAQUISIC` (AccountReconciliation, AssetControlModule ×5, AssetLedger, AssetUnitizeModal,
  ImpairmentTestModal, depreciationService ×2), `status || STATUS` (Dashboard, Inventory),
  `endereco || ENDERECO` / `databaixa || DATABAIXA` (Inventory), `filial || UNIDADE`
  (SoftDeleteReport).
- **Payload de sync** (`supabaseService.syncAssetsToCloud`): leituras diretas
  (`status`, `etiqueta`, `qt`, `serial`, `dataaqusic`, `cnpj`, `nomefornecedor`, `notafiscal`,
  `endereco`, `registro`, `subreg`, `databaixa`, `descricaodoativo`, `centrodecusto`,
  `vlraquisic`, `sn1/sn3_recno`, `primarykey`, `filial`); **aliases de campo distinto
  preservados** (`GRUPO_EMPRESARIAL`→tenant, `_unitid`→filial, `conta_contabil`→contacontabil,
  `id`→primarykey). Comparação morta `val === ''` (sn) removida (TS2367).
- **`utils/schema.ts`** — bloco de fallback UPPER de escrita removido (~289-306); mantido
  `conta_contabil` (alias de leitura do sync). As **leituras UPPER de entrada** do
  `normalizeAssetContract` permanecem: é o gateway de ingestão de payloads externos
  (restores `.dat`, Excel, API) — não migrados pela C4 (tolerância durável).
- **`pickCanonical` remanescente (intencional):** `migrationV5.ts` (upgrade version(5) lê
  legados UPPER) e `App.tsx:3151` (QR público `decoded` — etiquetas físicas não migram).
- **Varredura final (§8):** zero leituras de membro UPPER de dados locais; residual apenas
  o gateway de ingestão acima + contratos de UI/label (`editableFields`/`qrCodeFields`/
  `QR_FIELD_ORDER`/`TYPE_LABELS`/`SearchFilters`) + runtime preservado
  (`TAG_INVENTARIO`/`DE_PARA`/`AUDITOR_*`/`ESTADO_CONSERVACAO`/`GRUPO_EMPRESARIAL`).

Gate C5: `tsc -b --noEmit` ✓ · `vitest run` 179/179 ✓.

### 8.2 Fix do achado SRE — `findByEtiquetaInUnit` (2026-08-07)

**Bug:** o ramo de array de `localDb.assets.where()` consultava o índice
`[tenantid+filial]` com o valor `[etiqueta, unidade]` (dexie `.equals([etiqueta,
filial])` sobre o índice composto de tenant) — semanticamente nunca casava, e o
índice `[etiqueta+filial]`/`[etiqueta+_unitid]` nem existe no schema Dexie
(declará-lo exigiria `version(6)`).

**Correção (`src/services/localDbService.ts`):** o ramo de array passou a filtrar
**em memória**, parseando os campos do índice composto a partir do próprio `field`
(`[etiqueta+filial]` → `['etiqueta','filial']`) e casando cada parte contra o valor
correspondente do array, com **escopo de tenant** (mesma estratégia do ramo escalar,
já in-memory desde a M2) e `_is_deleted !== 1` no `first()`. Sem mudança de schema.

**Impacto:** `assetRepository.findByEtiquetaInUnit` volta a funcionar (busca exata na
unidade, padding de 6 zeros e fallback legado `[etiqueta+_unitid]`).

**Testes:** `src/__tests__/assetRepository.where.test.ts` (6 casos: positivo na
unidade, negativo outra unidade, padding numérico, fallback `_unitid`, deletado
ignorado no `first()`, escopo de tenant). Gate: `tsc -b --noEmit` ✓ · `vitest run`
185/185 ✓.

### 8.3 Auditoria do filtro cloud — `.eq('TAG_INVENTARIO')` alinhado ao contrato (2026-08-07)

**Achado:** `fetchCampaignStats` (supabaseService ~2584-2599) filtrava `public.assets`
por colunas **inexistentes** no schema: `.eq('currentCampaignId', …)` e
`.eq('TAG_INVENTARIO', 'DIVERGÊNCIA')` → PGRST204 em runtime (estatísticas de campanha
nulas no modo cloud). Varredura completa de `.eq()/.in()/.not()` no serviço: **nenhuma
outra violação** — todos os demais filtros usam colunas válidas (`tenantid`, `etiqueta`,
`filial`, `id`, `status`, `campaign_id`, `record_id`…).

**Por que `TAG_INVENTARIO` não pode ser consultada no cloud:**
- É chave **runtime LOCAL** (enum `TagInventario`), gravada pelo `determineTag`
  (regra de ouro / etiqueta física ≠ registro) — nunca enviada no payload de sync
  (projeção estrita de 26 colunas canônicas); o `public.assets` não tem a coluna
  (`tag_inventario` existe apenas em `staging`).

**Alinhamento ao contrato (colunas sincronizadas):**
- **Inventariados:** `currentCampaignId` (local, não sincronizado) → `status = 'CONFERIDO'`
  (marcador sincronizado de conferência — espelha o snapshot local
  `a._conferido || a.status === 'CONFERIDO'`).
- **Divergências:** derivadas das colunas sincronizadas `status` + `databaixa`
  (regra de ouro do app — `isGoldenRuleDivergent`: status ≠ *BAIXA* E databaixa
  presente): `.not('status','ilike','%BAIXA%').not('databaixa','is',null)`.
- Sem mudança no `total` (`.eq('tenantid')` — válido).

**Observação (follow-up opcional, fora do escopo):** estatísticas **por campanha** no
cloud exigem o fluxo de `campaign_snapshots` (assets_data JSON por campanha) — o
`public.assets` não carrega vínculo de campanha; os contadores alinhados são
tenant-wide (única opção 1:1 com o contrato atual).

Gate: `tsc -b --noEmit` ✓ · `vitest run` 185/185 ✓.

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
