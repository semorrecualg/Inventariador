# GBR KARDEK – Inventariador · Baseline de Schema (Fase 0)

> **Status:** CONGELADO ✅ · **Data:** 2026-08-06 (v4) · **v5:** 2026-08-07 (Fase C4) · **v7:** 2026-08-12 (Muro multi-tenant) · **v8:** 2026-11-22 (backup da limpeza de cópias exatas) · **v9:** 2026-11-25 (fila de subida durável) · **v10:** 2026-11-25 (saída do terceiro espelho)
> **Banco:** `InventoryLocalStore` (`class InventoryDexieDatabase`) · **Versão atual:** **10**
> **Fase:** 0 do plano `docs/MIGRACAO_HIBRIDA.md` (baseline estável) + Fase C4
> (`docs/PLANO_FASE_C_HIGIENIZACAO.md` §6 — v5 = v4 **sem mudança estrutural**, apenas etapa de dados)
> + Muro multi-tenant (v6→v7 — chave composta `[tenantid+primarykey]`, ver §1).
>
> Este documento é o **snapshot canônico e congelado** do schema local (10 tabelas Dexie +
> `src/constants/schema.ts`). A conformidade é garantida por contrato automatizado:
> `src/__tests__/schemaBaseline.test.ts` — qualquer mudança não intencional no schema
> **quebra o teste** e exige decisão explícita (documentar aqui + nova `version(n)`).

---

## 1. Banco e histórico de versões

| Versão | Mudança |
|---|---|
| **v1** | Criação inicial — 7 tabelas (sem `campaign_snapshots`, sem `addresses`) |
| **v2** | Adiciona `campaign_snapshots`; índice composto `[tenantId+filial]` nas 3 tabelas de ativos |
| **v3** | Adiciona `addresses` (`++id` auto-incremento) com índices `codigo_endereco`, `setor`, `bloco` |
| **v4** | **Canônico `tenantid`** (minúsculo) — migração **idempotente** via `upgrade(tx)`: copia `tenantId`/`_tenantid`/`tenant_id` → `tenantid` e remove as legadas nas tabelas `local_assets`, `ativos`, `assets`, `campaigns`, `addresses`; índices compostos passam a `[tenantid+filial]` |
| **v5** | **Fase C4** — MESMAS assinaturas do v4 (sem mudança estrutural). Etapa de DADOS no `upgrade(tx)`: reescreve chaves UPPER → canônico minúsculo e normaliza valores por classe (K/T/N/D/F) nas 3 tabelas de ativos + reconcile **aditivo** de `addresses` (nunca apaga linhas). Idempotente (`modify` retorna `false` quando nada muda — 2ª execução → 0 escritas); PK (`primarykey`/`id`) imutável; chaves de runtime (`TAG_INVENTARIO`, `DE_PARA`, …) preservadas; pulável via `NORMALIZE_ON_UPGRADE=false` (rollback instantâneo). Módulo: `src/services/migrationV5.ts` |
| **v6** | **Muro multi-tenant (passo 1/2)** — o Dexie **não suporta trocar a chave primária num upgrade direto** ("Not yet support for changing primary key"); a receita oficial é REMOVER numa versão e RECRIAR na seguinte. v6: DROP das 3 tabelas de ativos (`local_assets`, `ativos`, `assets`) + cópia **integral** para backups `_v6_bkp_local/_v6_bkp_ativos/_v6_bkp_assets` |
| **v7** | **Muro multi-tenant (passo 2/2)** — RECREATE com **chave primária composta `[tenantid+primarykey]`** nas 3 tabelas (o `tenantid` normalizado para UPPER canônico garante chaves consistentes; `primarykey` vira **índice**) + restauração a partir dos backups + descarte dos backups. Dois contratos com a mesma chave de origem **coexistem sem colidir** (mesma regra da nuvem: PK composta `(tenantid, id)`). Guard `filterCrossTenantWrites` (`sqliteService`) permanece como invariante de segurança p/ escritas legadas |
| **v8** | **Backup da limpeza de cópias exatas** — tabela nova `asset_cleanup_backups` (`++seq`, índices `cleanup_id`, `kind`) guarda as linhas removidas pela limpeza do Gestor de Base, na MESMA transação das remoções. Nenhuma tabela existente muda de chave/índices; o «DESFAZER LIMPEZA» restaura por `cleanup_id` |
| **v9** | **Fila de subida durável** — tabela nova `sync_outbox` (chave `key` = `tenantid|primarykey`; índices `primarykey`, `tenantid`, `status`, `next_attempt_at`). `key` como chave primária torna o reenfileiramento idempotente; `attempts`/`next_attempt_at` dão recuo ao envio e `op` distingue upsert de exclusão. A entrada é escrita na MESMA transação do ativo (`saveCollectedAssetAtomic`) e removida quando a nuvem aceita. Nenhuma tabela existente muda de chave/índices. Módulo: `src/services/syncOutbox.ts` |
| **v10** | **Saída do terceiro espelho** — `assets: null` apaga a store no upgrade. Desde a A.3a.3 ninguém lhe escrevia e desde a A.3a.1 ninguém a lia; o conteúdo era réplica de `local_assets`/`ativos`, por isso não há cópia de dados. Nenhuma tabela viva muda de chave/índices. Prova: `src/__tests__/migracaoV10.test.ts` |

**Regra de evolução:** alterar o schema local = **nova `version(n)`** no
`InventoryDexieDatabase` (`src/services/sqliteService.ts`) com `upgrade` idempotente,
atualização **deste** documento e do teste de contrato. Proibido editar `version(4)`/`version(5)`/`version(6)` retroativo.

---

## 2. Tabelas — snapshot canônico v10 (10 tabelas + 3 backups transitórios descartados em v6)

| Tabela | Chave primária | Índices | Tipo (fonte) |
|---|---|---|---|
| `local_assets` | **`[tenantid+primarykey]`** (composta) | `primarykey`, `filial`, `_is_synced`, `[tenantid+filial]` | `DexieAsset` |
| `ativos` | **`[tenantid+primarykey]`** (composta) | `primarykey`, `filial`, `_is_synced`, `[tenantid+filial]` | `DexieAsset` |
| `audit_logs` | `id` | `updated_at` | `DexieAuditLog` |
| `campaigns` | `id` | `tenantid` | `DexieCampaign` |
| `SYSTEM_CONTEXT` | `key` | — | `DexieSystemContext` |
| `unit_configs` | `id` | `filial` | `DexieUnitConfig` |
| `campaign_snapshots` | `id` | `campaign_id` | `DexieCampaignSnapshot` |
| `addresses` | `++id` (auto) | `[tenantid+filial]`, `codigo_endereco`, `setor`, `bloco`, `_is_synced` | `DexieAddress` |
| `asset_cleanup_backups` | `++seq` (auto) | `cleanup_id`, `kind` | `DexieAssetCleanupBackup` |
| `sync_outbox` | `key` (`tenantid\|primarykey`) | `primarykey`, `tenantid`, `status`, `next_attempt_at` | `DexieSyncOutbox` |

Fonte das definições: `src/services/sqliteService.ts` (interfaces exportadas;
classe `InventoryDexieDatabase`). Declaração das tabelas no Dexie:
`version(9).stores({ sync_outbox: 'key, primarykey, tenantid, status, next_attempt_at' })` (ver §1) — a leitura por chave em código usa o par
composto `[tenantid, primarykey]` (`persistenceService`, `InventoryCard`, `App`).

---

## 3. Colunas por tabela (tipos canônicos)

### 3.1 `local_assets` / `ativos` → `DexieAsset`
Duas tabelas espelho (mesmo tipo/shape). `assets` saiu na v10. Isolamento multi-tenant obrigatório por
`tenantid` + `filial`.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | `string` | Espelha `primarykey` |
| `tenantid` | `string` | Canônico (minúsculo) |
| `filial` | `string` | Canônico (Índice 1 da planilha) — substitui `_unitid` |
| `_unitid?` | `string` | ⚠️ Legado — somente leitura (coluna removida no Supabase) |
| `status` | `string` | `PENDENTE`/`CONFERIDO`/… |
| `etiqueta`, `tag` | `string` | Plaqueta patrimonial |
| `qt` | `number` | Quantidade |
| `descricaodoativo` | `string` | Descrição |
| `serial`, `dataaqusic`, `cnpj`, `nomefornecedor`, `notafiscal`, `endereco`, `registro`, `subreg`, `databaixa`, `contacontabil`, `centrodecusto` | `string \| null` | 21 índices contábeis |
| `primarykey` | `string` | Chave primária Dexie |
| `vlraquisic` | `number` | Valor de aquisição |
| `sn1_recno`, `sn3_recno` | `number \| null` | Recnos Protheus |
| `_is_synced`, `_is_deleted`, `_conferido`, `_plaquetado`, `_aprovado`, `_isNew`, `_is_unitized`, `_is_divergent_baixa` | `number` | Flags `0\|1` |
| `_history`, `DE_PARA`, `_photoUrl` | `string \| null` | Histórico, de-para, foto |
| `gps_lat`, `gps_lng` | `number \| null` | Geolocalização |
| `currentCampaignId?`, `tag_atual?`, `status_auditoria?`, `descricao?`, `codigo_barra_coletado?` | opcionais | Metadados de auditoria |

### 3.2 `audit_logs` → `DexieAuditLog`
`id` (pk), `usuario`, `acao`, `tabela`, `registro_id`, `details`, `delta` (`string|null`), `updated_at`,
`tenantid?`, `new_data?` (`string|null`), `old_data?` (`string|null`),
`_synced?` (`0|1`), `_syncAttempts?`, `_syncError?` (`string|null`).

- `tenantid` é o **contrato do momento do evento**, carimbado no nascimento
  (`localDb.auditLogs.add` e `sqliteService.logAuditEvent`). Antes, a fila de F2
  resolvia-o no envio — um evento de A subia carimbado como B se o operador
tivesse trocado de contrato entretanto.
- `new_data`/`old_data` são os dois estados, em JSON próprio. O `delta` legado
  guardava UM deles (`new_data ? … : old_data`) e perdia o anterior; continua a
  ser preenchido como espelho do estado novo porque a deduplicação de falhas lê
  `delta.signature`.

`_synced`, `_syncAttempts` e `_syncError` são o estado da fila para a nuvem (F2):
ausente/`0` = por subir, `1` = confirmado pelo Supabase. **Nenhum destes campos é
índice** e não mudam `version()` — a fila lê por `filter`, para apanhar também as
linhas escritas antes deste campo existir (que continuam a contar como por subir).

### 3.2.1 Nuvem — `public.audit_logs` (Supabase)

O bootstrap declara a tabela como a produção a tem de facto, verificada em
23/11/2026 contra o projeto real:

| Item | Produção / bootstrap |
|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` |
| `user_email` | `text NOT NULL` |
| `tenantid`, `action`, `table_name`, `record_id`, `origin` | `text` |
| `details`, `new_data`, `old_data` | `jsonb` — confirmado na `information_schema` em 23/11/2026 |
| `created_at` | `timestamptz DEFAULT now()` |
| `client_event_id` | `text`, índice único `audit_logs_client_event_id_key` |

Divergências que já custaram erros em produção:

- `CREATE TABLE IF NOT EXISTS` **não** altera uma tabela existente: esta secção
  documenta o alvo, não migra a base.
- `details` era `text` no bootstrap antigo; na produção é `jsonb`. O app envia o
  payload como documento JSON (uma string vira `"…"`), por isso o `upsert` da
  fila funciona; um `insert` manual em SQL tem de usar `to_jsonb('…'::text)`.
- `user_email` é `NOT NULL`: o app envia `''`, nunca `null`.
- `id` em produção é `uuid` com default (o app nunca o envia); o bootstrap antigo
  declarava `bigint GENERATED ALWAYS AS IDENTITY`.

Verificado em 23/11/2026: `details`, `new_data` e `old_data` são `jsonb`;
`user_email` e `action` são `NOT NULL` sem default; as restantes colunas são
nuláveis. A migração `client_event_id` está aplicada (coluna `text`, índice
único `audit_logs_client_event_id_key` válido e sem duplicados). Para
reconfirmar tipos e nulabilidades:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
order by ordinal_position;
```

Guia operacional: `docs/MIGRACAO_AUDITORIA_CLIENT_EVENT_ID.md`.

### 3.3 `campaigns` → `DexieCampaign`
`id` (pk), `name`, `status`, `tenantid` (canônico), `created_at`.

### 3.4 `SYSTEM_CONTEXT` → `DexieSystemContext`
`key` (pk), `value`, `updated_at`.

### 3.5 `unit_configs` → `DexieUnitConfig`
`id` (pk), `filial`, `nome`, `hasGps`, `requireNf`, `requireSeriado`, `allowNewAssets`,
`allowWriteOffs`, `requirePlaqueta` (últimos 7 numéricos `0|1`).

### 3.6 `campaign_snapshots` → `DexieCampaignSnapshot`
`id` (pk), `campaign_id`, `assets_data` (JSON string), `metadata` (string), `closed_at`, `closed_by`, `tenantid`.

### 3.7 `addresses` → `DexieAddress`
`id` (`number`, auto-incremento `++id`), `tenantid`, `filial`, `codigo_endereco`, `setor`, `bloco`, `_is_synced`.
Indexação composta `[tenantid+filial]` → queries sub-12ms no `AddressSelector`.

### 3.8 `asset_cleanup_backups` → `DexieAssetCleanupBackup`
`seq` (`number`, auto-incremento `++seq`), `cleanup_id`, `kind` (`meta` | `rows`),
`table`, `chunk`, `rows` (JSON), `created_at`. Um `meta` por limpeza e blocos de
1.000 linhas removidas (`kind: 'rows'`). É o que o «DESFAZER LIMPEZA» do Gestor
de Base lê (`services/assetMirrorCleanupService`); ver `docs/LIMPEZA_COPIAS_EXATAS.md`.

---

## 4. Baseline `src/constants/schema.ts`

| Export | Conteúdo | Uso |
|---|---|---|
| `DB_ASSET_COLUMNS` | Dicionário central (~56 colunas: variações maiúsculas do Excel + canônicas minúsculas) | Mapeamento de importação (planilha → Dexie) |
| `SCHEMA_PRIORITY` | 12 grupos semânticos de sinônimos de cabeçalho (`UNIT`, `DESCRIPTION`, `TAG`, `COST_CENTER`, `ACCOUNT`, `DATE`, `VALUE`, `INVOICE`, `VENDOR`, `SERIAL`, `ADDRESS`, `GROUP`) | Resolução de cabeçalho no loader |
| `TYPE_LABELS` | Rótulo legível por grupo | UI de configuração de colunas |

**Contrato de carga (21 colunas fixas, nome E ordem):** `tenantid;filial;status;etiqueta;qt;`
`descricaodoativo;serial;dataaqusic;cnpj;nomefornecedor;notafiscal;endereco;registro;subreg;`
`databaixa;contacontabil;primarykey;centrodecusto;vlraquisic;sn1_recno;sn3_recno` —
`tenantid` obrigatoriamente na posição 0. Todos os 21 canônicos existem em `DB_ASSET_COLUMNS`
(assertado pelo teste de contrato).

---

## 5. Garantias do congelamento

1. **Contrato automatizado:** `src/__tests__/schemaBaseline.test.ts` (node) asserta
   `db.verno === 10`, o conjunto exato das tabelas, a assinatura de chave/índices de cada
   tabela e a presença dos 21 canônicos em `DB_ASSET_COLUMNS`. Drift → teste vermelho.
2. **Fingerprint de drift:** a assinatura canônica congelada das 10 tabelas é:
   `local_assets: [tenantid+primarykey],primarykey,filial,_is_synced,[tenantid+filial]` ·
   `ativos: idem` · `audit_logs: id,updated_at` · `campaigns: id,tenantid` ·
   `SYSTEM_CONTEXT: key` · `unit_configs: id,filial` ·
   `campaign_snapshots: id,campaign_id` · `addresses: ++id,[tenantid+filial],codigo_endereco,setor,bloco,_is_synced` ·
   `asset_cleanup_backups: ++seq,cleanup_id,kind` ·
   `sync_outbox: key,primarykey,tenantid,status,next_attempt_at`.
3. **Proibição:** editar `version(4)`/`version(5)`/`version(6)` retroativo; escrever colunas legadas (`_unitid`,
   `tenantId`, `tenant_id`, `_tenantid`); SQL raw (proibido pelo contrato SRE — só API Dexie).
4. **Muro multi-tenant:** a chave composta `[tenantid+primarykey]` torna a colisão entre
   contratos **estruturalmente impossível**; o guard `filterCrossTenantWrites` bloqueia
   sobrescritas de escritas legadas que ignorem o par composto.

---

## 6. Referências

- Definições: `src/services/sqliteService.ts` (interfaces + classe `InventoryDexieDatabase`)
- Dicionário: `src/constants/schema.ts`
- Contrato: `src/__tests__/schemaBaseline.test.ts`
- Plano: `docs/MIGRACAO_HIBRIDA.md` (Fase 0) · Arquitetura: `docs/ARCHITECTURE.md` §7
- Padronização `tenantid`: `docs/ARCHITECTURE.md` §7.6 / §12.4
- Muro multi-tenant (chave composta): `docs/ARCHITECTURE.md` §7.1 · `CHANGELOG.md [Unreleased]`
