# Auditoria Estrutural — Campo `endereco` (Variantes de Grafia / Case / Acentuação)

> **Status:** FASE DE PLANEJAMENTO E AUDITORIA ✅ (Risco Zero — **nenhuma alteração aplicada**)
> **Data:** 2026-08-06 · **Projeto:** GBR KARDEK v24.50-PROD (Inventariador v2.6.0)
> **Base da varredura:** árvore real do workspace (`src/` presente) — snapshot com alterações
> locais não commitadas (ver `git status`). Números de linha referem-se a esta base.
> **Alinhamento:** `SYSTEM_INSTRUCTIONS.md` (SRE, seção 3 — trava de validação).

---

## 0. Diretrizes críticas (contrato desta auditoria)

1. **Risco zero:** nenhuma indisponibilidade ou quebra no ecossistema.
2. **Sem alterações:** nenhuma coluna, tabela, variável ou chave de API foi alterada/removida/renomeada.
3. **Preservação de dados:** nenhum texto/conteúdo foi limpo ou modificado — somente mapeamento (metadados).
4. **Execução incremental:** etapas isoladas; correções dependem de aprovação e de contrato de normalização (ver §5).

---

## 1. ETAPA 1 — Varredura de Schema no Supabase (PostgreSQL)

### 1.1 Status de acesso
O projeto Supabase **não é alcançável a partir deste workspace** (app opera em modo `INTERNAL`
— `isInternalMode=true`; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` não configuradas nas
variáveis do ambiente). A query abaixo é **read-only** e deve ser executada no **SQL Editor**
do painel do Supabase pelo operador; o resultado alimenta a seção 3.1 deste documento.

### 1.2 Query de varredura (read-only — copiar para o SQL Editor)

```sql
SELECT
    table_schema,
    table_name,
    column_name,
    data_type
FROM
    information_schema.columns
WHERE
    table_schema NOT IN ('pg_catalog', 'information_schema', 'storage', 'vault', 'auth')
    AND (
        lower(column_name) LIKE '%endereco%'
        OR lower(column_name) LIKE '%endereço%'
    )
    AND column_name != 'endereco';
```

### 1.3 Tabelas-alvo esperadas (schema `public` — 10 tabelas, `ARCHITECTURE.md` §7.6)
`asset_logs` · `assets` · `audit_logs` · `campaign_snapshots` · `campaigns` ·
`inventory_campaign_snapshots` · `inventory_campaigns` · `inventory_config` ·
`unit_gps_data` · `user_permissions`.

**Expectativa estrutural:** apenas `public.assets.endereco` (canônica, `text`/`varchar`, nullable)
existe. A query retorna linhas **somente se** houver colunas com `endereco`/`endereço` no nome
diferentes da canônica.

**Resultado executado em 2026-08-06:** retornou **1 linha real** — `staging.assets."ENDERECO"`
(ver §3.1). O schema `public` (produção do app) **não** retornou variantes.

---

## 2. ETAPA 2 — Varredura no Código-Fonte (resultado real)

Comando executado (excluindo `node_modules`, `.git`, `dist`, `build`, `package-lock.json`):

```bash
grep -rEniE "endere[çc]o|ENDERECO|ENDEREÇO|Endereco|Endereço" --exclude-dir={node_modules,.next,.git,dist,build} .
```

### 2.1 Achado central (SRE): dupla grafia estrutural
A propriedade em memória dos objetos é **`ENDERECO` (UPPERCASE)** — dominante em todo o
runtime — enquanto a **coluna canônica do banco/contrato de carga é `endereco` (minúsculo)**.
Há leitura híbrida tolerante (`ENDERECO || endereco`) e normalização de valor feita **em
runtime** (`toUpperCase().trim()`) em vez de na carga.

### 2.2 Ocorrências por arquivo (formato `[arquivo] -> [linha] -> [contexto]`)

**`src/App.tsx`**
- `src/App.tsx -> 219 -> editableFields: ['DESCRICAODOATIVO', 'SERIAL', 'ENDERECO'] (chave UPPER de edição)`
- `src/App.tsx -> 664-670 -> state selectedAddress + sessionStorage 'current_selected_address' (anchor do inventário)`
- `src/App.tsx -> 725, 741 -> ENDERECO: '' (estado inicial de formulários, chave UPPER)`
- `src/App.tsx -> 1893 -> leitura híbrida: String((item).ENDERECO || item.endereco || '').trim().toUpperCase()`
- `src/App.tsx -> 1899 -> comparação addrVal !== currentAddr.toUpperCase().trim() (normalização em runtime)`
- `src/App.tsx -> 3466 -> effectiveLoc = a._localMaster || a.ENDERECO || a.LOCALIZACAO || a.CENTRO_CUSTO || 'SEM LOCAL'`
- `src/App.tsx -> 3541, 3544, 3554 -> normalizeKey(asset.ENDERECO) (CONFERIDO/ADOTADO por endereço original)`
- `src/App.tsx -> 4220-4223 -> gravação: (updatedAsset.ENDERECO || "").toUpperCase().trim() (persiste UPPER)`
- `src/App.tsx -> 4835-4838 -> idem para updates.ENDERECO (reconciliação)`
- `src/App.tsx -> 4870-4873 -> alteredFields.add('ENDERECO'); originalValues['ENDERECO'] (delta de auditoria)`
- `src/App.tsx -> 4998-5000 -> AUDITOR_LOCAL_ORIGINAL = a.ENDERECO; AUDITOR_LOCAL_AUDITADO = a._localMaster || a.ENDERECO; AUDITOR_DE_PARA`
- `src/App.tsx -> 6244 -> uniqueEnderecos={allLocations} (prop p/ seletor)`
- `src/App.tsx -> 1801, 1808-1809, 1871, 1878, 4003-4008, 4307, 5169, 5219-5225, 5561 -> normalização .toUpperCase().trim() em unidade/filial (mesmo padrão, campos vizinhos)`

**`src/components/*`**
- `src/components/ActiveSearch.tsx -> 40, 45, 60, 81, 202 -> agrupa/filtra por a.ENDERECO || 'SEM LOCALIZAÇÃO'`
- `src/components/AddressSelector.tsx -> 89, 110, 123, 129, 131 -> UI (labels de endereço físico; 'PESQUISAR ENDEREÇO / LOCALIDADE...')`
- `src/components/AssetDetail.tsx -> 70, 91 -> prop uniqueEnderecos: string[]`
- `src/components/AssetDetail.tsx -> 306-309 -> reverse geocoding GPS (endereço capturado da API)`
- `src/components/AssetDetail.tsx -> 463 -> { key: 'ENDERECO', label: TYPE_LABELS.ADDRESS } (payload de edição, chave UPPER)`
- `src/components/AssetDetail.tsx -> 505-506 -> sugestões: uniqueEnderecos.filter(e => e.includes(editValue.toUpperCase())) (assume UPPER)`
- `src/components/AssetDetail.tsx -> 667, 849, 858, 913, 935, 1086, 1103, 1109 -> exibição DE/PARA (_localMaster vs ENDERECO)`
- `src/components/AssetListItem.tsx -> 63, 138 -> exibição asset._localMaster || asset.ENDERECO`
- `src/components/AssetMap.tsx -> 116, 190, 203, 398 -> filtro/mapa por a._localMaster || a.ENDERECO || 'SEM LOCAL'`
- `src/components/AssetPrintView.tsx -> 183 -> relatório: asset.ENDERECO || 'Localidade indefinida'`
- `src/components/Consultation.tsx -> 268 -> ENDERECO: '' (chave UPPER)`
- `src/components/Dashboard.tsx -> 420-422 -> AUDITOR_LOCAL_ORIGINAL/AUDITADO/DE_PARA (a.ENDERECO)`
- `src/components/FieldConfigurator.tsx -> 37 -> ENDERECO: 'Localização Física' (label de configuração)`
- `src/components/Inventory.tsx -> 639 -> _localMaster: selectedLocationRef.current || foundAsset.ENDERECO || foundAsset.endereco (leitura híbrida)`
- `src/components/Inventory.tsx -> 748, 761 -> gravação ENDERECO: selectedLocation || "" / asset.ENDERECO (chave UPPER)`
- `src/components/TrustOnboarding.tsx -> 21 -> lista UPPER 'ENDERECO', 'REGISTRO', 'SUBREG', ...`
- `src/components/BaseManagerPanel.tsx -> 290 -> comentário: higienização de endereços em caixa alta sem ruídos (intenção documentada)`

**`src/services|stores|utils|constants`**
- `src/services/DatabaseLoaderService.ts -> 64 -> contrato de carga (…'notafiscal', 'endereco', 'registro'…)`
- `src/services/DatabaseLoaderService.ts -> 178-182 -> alias de cabeçalho → canônico: endereco, localizacao, localização, localidade, physicallocalization, loc, local, sala, posicao, posição, codigo_endereco (11 sinônimos)`
- `src/services/DatabaseLoaderService.ts -> 351, 618 -> mesmo alias set (+'end'); valor com apenas .trim() (sem UPPER/acentos)`
- `src/services/sqliteService.ts -> 106, 153, 167 -> interface DexieAddress + índices addresses (v3 [tenantId+filial] → v4 [tenantid+filial])`
- `src/services/sqliteService.ts -> 261 -> contrato 21 colunas (…'endereco'…)`
- `src/services/localDbService.ts -> 317-345 -> getLocationsWithStats: agrupa por addresses.codigo_endereco; fallback extrai localidades de assets quando addresses vazia`
- `src/services/localDbService.ts -> 326 -> filtro busca: String(codigo_endereco).toLowerCase().startsWith(cleanSearch)`
- `src/services/localDbService.ts -> 376 -> displayName = codigo_endereco.trim() || 'GERAL - NÃO ESPECIFICADO'`
- `src/services/utils/addressParser.ts -> 5, 15 -> codigo_endereco: cleanStr(input.codigo_endereco).replace(/[^A-Z0-9-]/g, '') (UPPER + expurgo Excel — padrão SRE §6)`
- `src/services/persistenceService.ts -> 200 -> codigo_endereco: trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')`
- `src/services/reportService.ts -> 20 -> payload de relatório: 'ENDERECO': a.ENDERECO (chave UPPER)`
- `src/stores/inventoryStore.ts -> 102 -> editableFields: ['DESCRICAODOATIVO', 'SERIAL', 'ENDERECO']`
- `src/utils/qrUtils.ts -> 25 -> campos QR incluem 'ENDERECO'`
- `src/constants/schema.ts -> 11 -> DB_ASSET_COLUMNS (variações maiúsculas Excel, inclui 'ENDERECO')`
- `src/constants/schema.ts -> 21 -> canônicas minúsculas (…'notafiscal', 'endereco'…)`
- `src/constants/schema.ts -> 102 -> SCHEMA_PRIORITY grupo ADDRESS (inclui 'ENDERECO')`
- `src/__tests__/schemaBaseline.test.ts -> 53, 61 -> contrato congelado: addresses + 21 colunas canônicas (endereco)`

**Documentação (evidência de contrato/desenho)**
- `docs/COMPONENTS_MAP.md -> 83 -> filtro documentado: AND (TRIM(UPPER(ENDERECO)) = ? OR TRIM(UPPER(endereco)) = ?) — ⚠️ NÃO localizado literal igual no src/ atual (ver §4, item D4)`
- `SYSTEM_INSTRUCTIONS.md -> 36 -> indexação addresses (++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced)`

---

## 3. Relatório de Impacto (formato solicitado)

### 3.1 Inconsistências no Supabase — `[Schema].[Tabela] -> [Coluna Variante] -> [Qtd registros]`
**Executada 2026-08-06 (SQL Editor). Retorno bruto da query da ETAPA 1:**

| table_schema | table_name | column_name | data_type |
|---|---|---|---|
| `staging` | `assets` | `"ENDERECO"` | `text` |

**Retorno da query (c) — família `endereco` em `assets` (completa, colapsada por `lower()`):**

| table_schema | table_name | column_name | data_type |
|---|---|---|---|
| `public` | `assets` | `endereco` | `text` |
| `staging` | `assets` | `"ENDERECO"` | `text` |
| `staging` | `assets` | `endereco` | `text` |

**Registro no formato do relatório:**

| Schema.Tabela | Coluna variante | Qtd de registros (tabela) | Observação |
|---|---|---|---|
| `public.assets` | — (nenhuma variante) | `?` | **Limpo.** Única coluna de endereço: `endereco` (canônica) — schema consumido pelo app/sync |
| `staging.assets` | `"ENDERECO"` (UPPERCASE, quoted identifier) **+ `endereco` coexistindo** | **pendente** (SQL a/b) | **Caso B** (legada + canônica): coluna UPPERCASE criada com aspas preservando o cabeçalho do Excel; a canônica `endereco` também existe — provável importação dupla/fora do app |

**Classificação (padrão do projeto):** `staging.assets` é o **Caso B** das migrações já
existentes (`scripts/migrate-*.sql`): mesclar dados da legada → canônica (só onde vazia),
reescrever dependências e `DROP` da legada — **após aprovação e medição**. `public.assets` é
**Caso C** (no-op).

**Nota crítica SRE:** o schema `staging` **não existe na arquitetura documentada**
(`ARCHITECTURE.md` §7.6 lista somente `public`, 10 tabelas) e **não há nenhuma referência a
`staging` no código, scripts ou migrações do repositório** (grep = 0; `scripts/migrate-*.sql`
operam apenas em `public`). A coluna `"ENDERECO"` em UPPERCASE só existe porque foi criada com
**identificador entre aspas** — preservando literalmente o cabeçalho do Excel. Conclusão:
tabela criada/manipulada **fora do app** (pipeline manual/EDA no painel) ou ambiente de staging
do projeto Supabase. O app sincroniza com `public.assets`; `staging.assets` **não é consumido
pelo código**.

**Medição pendente (rodar no SQL Editor — read-only, risco zero):**
```sql
-- (a) Contagem total e preenchimento em staging.assets
SELECT count(*) AS total,
       count(*) FILTER (WHERE "ENDERECO" IS NOT NULL AND btrim("ENDERECO") <> '') AS com_endereco
FROM staging.assets;

-- (b) Amostra de variações (case/acento/espaços) — top 50 por frequência
SELECT "ENDERECO", count(*) AS qtd
FROM staging.assets
GROUP BY 1
ORDER BY 2 DESC
LIMIT 50;

-- (c) [EXECUTADA] public.assets possui 'endereco' E 'ENDERECO' simultaneamente? (lower() colapsa case)
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'assets'
  AND lower(column_name) IN ('endereco', 'endereco2', 'endereço', 'enderenco')
ORDER BY 1, 2, 3;
-- Resultado: public=endereco (limpo) · staging="ENDERECO"+endereco (Caso B)

-- (d) [EXECUTADA] Divergência de dados entre as duas colunas em staging.assets (read-only)
SELECT count(*) AS divergentes
FROM staging.assets
WHERE btrim(upper("ENDERECO")) IS DISTINCT FROM btrim(upper(endereco));
-- Resultado: 0 divergentes → mescla "ENDERECO" → endereco = ZERO perda de dados
```

**Resultado da medição (d): `0` divergentes.** As duas colunas de `staging.assets` são
semanticamente idênticas (comparação `btrim(upper())`). Conclusão SRE: a reconciliação
Caso B em `staging.assets` reduz-se a **copiar valores apenas onde `endereco` estiver vazia
(esperado: zero linhas) + reescrever dependências + `DROP` da coluna `"ENDERECO"`** — sem
perda de dados e sem impacto em `public` (que permanece no-op).

### 3.2 Inconsistências no Código — `[Caminho do Arquivo] -> [Linha] -> [Contexto]`
Consolidado na seção 2.2. Resumo executivo por categoria:

| Categoria | Contagem aprox. (touchpoints) | Exemplo-chave |
|---|---|---|
| Chave UPPER `ENDERECO` como propriedade de objeto (runtime/UI/payloads) | ~30 | `App.tsx:219`, `AssetDetail.tsx:463`, `reportService.ts:20`, `inventoryStore.ts:102`, `qrUtils.ts:25` |
| Leitura híbrida tolerante `ENDERECO \|\| endereco` | 2 | `App.tsx:1893`, `Inventory.tsx:639` |
| Normalização de valor em runtime (`toUpperCase().trim()`) | ~15 | `App.tsx:1899, 4223, 4838` |
| Alias de cabeçalho no loader (11 sinônimos → canônico) | 3 | `DatabaseLoaderService.ts:182, 351, 618` |
| Escrita de valor apenas `.trim()` (sem UPPER) no loader | 1 | `DatabaseLoaderService.ts:618` |
| Cadeia derivada `addresses.codigo_endereco` (parser UPPER+regex) | 5 | `addressParser.ts:15`, `persistenceService.ts:200`, `localDbService.ts:317-345` |
| Anchor de sessão `current_selected_address` | 3 | `App.tsx:664-670`, `Inventory.tsx` |
| Contrato canônico `endereco` (minúsculo) — referência | 4 | `schema.ts:21`, `sqliteService.ts:261`, `DatabaseLoaderService.ts:64`, `schemaBaseline.test.ts:61` |

---

## 4. Classificação SRE (causas-raiz)

- **D1 — Dupla grafia estrutural:** objeto em memória usa `ENDERECO` (UPPER) enquanto o contrato
  de banco/carga usa `endereco` (minúsculo). É a maior superfície de confusão (≈30+ pontos).
- **D2 — Normalização assimétrica:** a carga grava o valor com `trim()` apenas
  (`DatabaseLoaderService.ts:618`); a leitura compensa com `toUpperCase().trim()` espalhado
  (~15 pontos) e leitura híbrida `ENDERECO || endereco` (2 pontos). A normalização canônica
  (UPPER + expurgo `[^A-Z0-9-]`) só existe na cadeia derivada `addressParser`/`persistenceService`.
- **D3 — Duas fontes de verdade do endereço:** coluna-texto do ativo (`endereco`) × tabela
  derivada `addresses.codigo_endereco` — sem guarda formal de consistência pós-carga
  (o fallback em `localDbService.ts:345` regenera localidades dinamicamente, o que pode
  divergir da tabela `addresses`).
- **D4 — Filtro SQL duplo documentado × código real:** `COMPONENTS_MAP.md:83` descreve
  `TRIM(UPPER(ENDERECO)) = ? OR TRIM(UPPER(endereco)) = ?`, mas o literal não foi localizado
  no `src/` atual (provavelmente do ramo SQLite nativo Android, Fase 3 da migração híbrida).
  **Pendência de confirmação** no branch do SQLite.
- **D5 — Supabase (CONFIRMADO em 2026-08-06):** `public.assets` está **limpo** (só `endereco`
  canônica — zero risco no schema consumido pelo app). A variante `staging.assets."ENDERECO"`
  coexiste com `endereco` na mesma tabela (**Caso B** do padrão de migração do projeto).
- **D6 — Schema `staging` fora da arquitetura:** zero referências no repositório (grep = 0;
  `scripts/migrate-*.sql` operam só `public`). A coexistência `"ENDERECO"` + `endereco` indica
  **dupla importação fora do app** (coluna UPPERCASE preserva o cabeçalho do Excel verbatim,
  via quoted identifier). **Divergência medida = 0** (query d) → a correção é **estrutural,
  cosmética e zero perda**: mesclar legada → canônica e remover `"ENDERECO"` do `staging`,
  sem tocar `public`. Pendências: contagens (a)/(b) e origem do schema.
- **D7 — Dupla importação GENERALIZADA (CONFIRMADO, query f 2026-08-06):** `staging.assets`
  carrega **24 colunas com case fora do padrão** — 16 UPPER de canônicos + 3 sinônimos
  (`DATAAQUSIC` com typo, `EMPRESA`, `TAG_INVENTARIO`) + `ESTADO_CONSERVACAO` + `Sn1_recno`
  mixed-case + 3 camelCase (`_campaignId`, `_origemTransacao`, `_tenantId`). `public.assets` =
  **0 variantes** (100% minúsculo). O caso do `endereco` **repetiu-se para todos os campos**
  (ver §6.6).
- **D8 — Contagem "26" resolvida (query e):** `public.assets` = **26 colunas**, todas minúsculas
  e canônicas (21 do contrato + `id`, `created_at`, `updated_at`, `_is_synced`, `_is_deleted`).
  **Zero anomalia estrutural no schema de produção** — a Fase D é **no-op** no `public` (ver §6.7).
- **D9 — `staging.assets` = schema legado DIVERGENTE, 58 colunas (query e):** acumula **3 gerações
  de shape** — (1) importação crua do Excel (24 case-variants quoted), (2) canônico parcial (17
  minúsculas, mas `qt` = **text**), (3) legado/experimental (14: `_unitid` [coluna removida do
  app], `_tenantid`, `_origemtransacao`, `conferido`, `is_new`, `descricao_master`,
  `plaqueta_master`, `local_master`, `empresa`, `empresa_normalizada`, `tag_duplicidade`,
  `tag_inventario`, `base_sintetica_loc` jsonb, `campos_alterados` jsonb). Tipos divergem do
  `public` (`id` bigint vs text · `qt` text vs integer). **Zero referências no repositório** →
  schema morto para o app; a Fase D deve decidir **destino** (congelar/drop/recriar), não
  reconciliar coluna a coluna (ver §6.7).

---

## 5. Próximos passos (incremental — zero alterações até aprovação)

1. **Fase A (auditoria — complemento):** §3.1 **fechado na estrutura e na qualidade de dados**
   (public limpo · staging Caso B `"ENDERECO"`+`endereco` · **divergência = 0**). Pendências de
   medição menores: queries (a)/(b) (contagens + amostra de variações); investigar a **origem
   do schema `staging`** (painel Supabase → Database/Schemas e migrações aplicadas); revalidar
   D4 no branch SQLite nativo (`rg -n "TRIM(UPPER" src/`).
2. **Fase B (contrato de normalização — decisão):** definir a regra canônica. Recomendação SRE:
   **`UPPER + TRIM + remoção de acentos/cedilha` aplicada na carga** — alinhada ao padrão já
   existente em `addressParser.ts:15`/`persistenceService.ts:200` e à diretriz de conversão
   `/[^A-Z0-9-]/g` do `SYSTEM_INSTRUCTIONS.md` §6.
3. **Fase C (correção no app):** padronizar escrita (`DatabaseLoaderService`), eliminar
   leituras híbridas e normalização em runtime, alinhar `ENDERECO`→`endereco` nos payloads,
   e migração Dexie `version(5)` idempotente (dry-run) para dados existentes + regeneração de
   `addresses`. Exige nova `version(n)` + atualização de `SCHEMA_BASELINE.md` e
   `schemaBaseline.test.ts`.
4. **Fase D (Supabase — planejada, aguarda aprovação):** `scripts/migrate-endereco-supabase.sql`
   seguindo a convenção `reconcile_*` de `migrate-tenantid/unitid-supabase.sql`, **escopada ao
   schema `staging`**: (1) pré-checks em `information_schema`; (2) merge `"ENDERECO"` → `endereco`
   apenas onde `endereco` vazia (esperado: 0 linhas — divergência medida = 0); (3) reescrita de
   políticas RLS/índices/constraints que referenciem `"ENDERECO"`; (4) `DROP` da coluna
   `"ENDERECO"`; (5) verificação pós-migração (só `endereco` + contagem/checksum). `public`
   permanece **no-op** (limpo). Execução somente após aprovação explícita.
5. **Gate de qualidade por fase:** `tsc -b --noEmit` · `vitest run` (144 testes) ·
   contrato `schemaBaseline` · contagem/checksum antes/depois (padrão Fase 0).

**Nenhum arquivo além deste relatório foi criado ou alterado nesta etapa.**

---

## 6. Expansão da higienização — todos os campos de `assets` (avaliação SRE)

> Decisão do operador (2026-08-06): aplicar a mesma metodologia de auditoria a todos os campos.
> **Regra de ouro: a AUDITORIA generaliza 1:1; a CORREÇÃO NÃO** — cada classe de campo tem
> regra própria (a regra do `endereco` aplicada a texto descritivo corromperia dados de negócio).
>
> **Decisões aprovadas em 2026-08-06:**
> 1. **Classe K** → regra **`UPPER + TRIM + expurgo [^A-Z0-9-]`** (mesma do `endereco`, padrão
>    já existente em `addressParser.ts:15`/`persistenceService.ts:200`);
> 2. **Escopo: somente auditoria** (queries e/f + grep §6.4) — **nenhuma correção** (Fases C/D)
>    nesta etapa; contratos das Fases C/D ficam congelados aguardando a leitura do §6.4 + e/f;
> 3. **`staging` incluso** na varredura Supabase (schema de fora da arquitetura do app).

### 6.1 Escopo canônico real (fontes no código — `src/services/sqliteService.ts`)
- **Contrato de carga (21 fixos):** `tenantid;filial;status;etiqueta;qt;descricaodoativo;serial;
  dataaqusic;cnpj;nomefornecedor;notafiscal;endereco;registro;subreg;databaixa;contacontabil;
  primarykey;centrodecusto;vlraquisic;sn1_recno;sn3_recno`.
- **Shape completo `DexieAsset` / `checkTableSchema` (37):** os 21 + `tag, _is_synced, _is_deleted,
  _conferido, _plaquetado, _aprovado, _isNew, _is_unitized, _is_divergent_baixa, _history,
  DE_PARA, _photoUrl, gps_lat, gps_lng, currentCampaignId`.
- ✅ **Contagem "26" RESOLVIDA (§6.7):** `public.assets` = **26 colunas** (21 do contrato + 5 de
  infra/sync), todas minúsculas e canônicas. O shape do código (37, `DexieAsset`) é mais amplo
  que o espelho do Supabase — o app sincroniza um subconjunto (gps/auditoria provavelmente
  normalizados em `unit_gps_data`/`audit_logs`).

### 6.2 Regras de normalização por CLASSE (decisão de contrato por classe)

| Classe | Campos | Regra de correção (Fases C/D) | Regra do `endereco`? |
|---|---|---|---|
| **K — código/chave** | `filial, etiqueta, tag, primarykey, registro, subreg, contacontabil, centrodecusto, cnpj, notafiscal, serial, endereco` | `UPPER + TRIM + expurgo [^A-Z0-9-]` (padrão já existente) | ✅ SIM |
| **T — texto descritivo** | `descricaodoativo, nomefornecedor, status (enum), _history, DE_PARA` | `TRIM` + colapso de espaços + **preservar caixa** | ❌ **NÃO** (corromperia dados) |
| **N — numérico** | `qt, vlraquisic, sn1_recno, sn3_recno, gps_lat, gps_lng` | validar parse numérico (sem case) | N/A |
| **D — data** | `dataaqusic, databaixa` | normalizar formato de data | N/A |
| **F — flags 0\|1** | `_is_synced, _is_deleted, _conferido, _plaquetado, _aprovado, _isNew, _is_unitized, _is_divergent_baixa` | `coerce Number(x)===1` | N/A |
| **S — âncora/derivada** | `current_selected_address`, `addresses.codigo_endereco` | alinhar à classe K | parcial |

### 6.3 ETAPA 1 generalizada (Supabase — read-only, SQL Editor)
**Status: queries (e) e (f) EXECUTADAS 2026-08-06 (resultados em §6.6 e §6.7).**

```sql
-- (e) Listar TODAS as colunas de assets por schema + resolver a contagem real (o "26")
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'assets' AND table_schema IN ('public', 'staging')
ORDER BY 1, 2, 3;

-- (f) TODAS as colunas com case fora do padrão minúsculo (generalização da detecção do
--     "ENDERECO": quoted identifiers preservando cabeçalho do Excel — qualquer domínio)
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'assets' AND table_schema IN ('public', 'staging')
  AND lower(column_name) <> column_name
ORDER BY 1, 2, 3;
```

### 6.4 ETAPA 2 generalizada — RESULTADO EXECUTADO (2026-08-06, `src/` real)
A dupla grafia **não é exclusiva do `endereco`**: é o **padrão sistêmico** — chaves UPPER em
runtime/payloads aparecem em 40+ arquivos e ~700 ocorrências para os 20 campos rastreados.
Comando executado (por campo, case-sensitive): `grep -rw '<CHAVE_UPPER>' src/` vs
`grep -rw '<chave_lower>' src/`.

**Contagem por campo (UPPER = runtime/payload/UI · lower = canônico/contrato):**

| Campo | UPPER | lower | Predominância |
|---|---|---|---|
| `ETIQUETA` | **160** | 75 | ⚠️ UPPER dominante (2,1×) |
| `ENDERECO` | **92** | 39 | ⚠️ UPPER dominante (2,4×) |
| `DESCRICAODOATIVO` | **71** | 31 | ⚠️ UPPER dominante (2,3×) |
| `VLRAQUISIC` | **51** | 30 | ⚠️ UPPER dominante |
| `STATUS` | 47 | 235 | lower dominante (enum de domínio) — mas 47 chaves UPPER em payloads |
| `SERIAL` | **43** | 34 | ⚠️ UPPER dominante |
| `DATABAIXA` | **36** | 25 | ⚠️ UPPER dominante |
| `CENTRODECUSTO` | **34** | 27 | ⚠️ UPPER dominante |
| `REGISTRO` | 32 | 48 | equilibrado (32 UPPER em runtime) |
| `DATAAQUISIC` | **26** | 2 | ⚠️ UPPER dominante (13×) |
| `FILIAL` | 19 | 394 | lower dominante (correto) — 19 UPPER em `SCHEMA_PRIORITY`/dict |
| `CNPJ` | 19 | 23 | equilibrado |
| `NOTAFISCAL` | 17 | 24 | equilibrado |
| `NOMEFORNECEDOR` | 16 | 24 | equilibrado |
| `SUBREG` | 11 | 24 | lower dominante |
| `TAG` | 10 | 55 | lower dominante |
| `PRIMARYKEY` | 6 | 96 | lower dominante |
| `SN1_RECNO` / `SN3_RECNO` | 4 / 4 | 23 / 23 | lower dominante |
| `CONTACONTABIL` | 2 | 33 | lower dominante |

**Distribuição por arquivo (40+ arquivos, amostra):** `src/utils/schema.ts`, `src/utils/qrUtils.ts`,
`src/utils/reportGenerator.ts`, `src/types.ts`, `src/stores/{inventoryStore,uiStore}.ts`,
`src/services/{supabaseService,reportService,tagService,protheusService,depreciationService,
stressTestService,demoSeed,DatabaseLoaderService}.ts`, `src/components/*` (Inventory, AssetDetail,
Dashboard, AssetMap, AssetLedger, PublicKardex, TrustOnboarding, FieldConfigurator, Labeling…).

**Interpretação SRE:** o padrão D1/D2 do `endereco` replica-se para **todas as classes K** com
predominância UPPER (`ETIQUETA`, `DESCRICAODOATIVO`, `VLRAQUISIC`, `SERIAL`, `DATABAIXA`,
`CENTRODECUSTO`, `DATAAQUISIC`, `ENDERECO`) — são os campos com maior risco de divergência
no sync/payload. `DB_ASSET_COLUMNS` (`constants/schema.ts`) já cobre ~14 dos 20 como sinônimos
UPPER de importação (fonte legítima da contagem UPPER no dict); o restante das ocorrências UPPER
está em runtime/payloads (mesma classe do achado D1).

### 6.5 Recomendação SRE (incremental, risco zero) — status 2026-08-06
1. ✅ **EXECUTADO — grep do §6.4** (tabela completa acima, 20 campos, `src/` real).
   **Zero referências a `staging` em `src/` e `scripts/`** (grep = 0) — confirma que o schema
   `staging` está fora da arquitetura do app.
2. ✅ **QUERIES (e) E (f) EXECUTADAS — §6.6/§6.7**: "26" **RESOLVIDO** — `public.assets` = **26
   colunas, 100% minúsculas e canônicas** (21 do contrato + `id`/`created_at`/`updated_at`/
   `_is_synced`/`_is_deleted`) → **zero ação no public**. `staging.assets` = **58 colunas** de
   **3 gerações de shape** (Excel verbatim + canônico parcial + legado/experimental) — ver D9.
3. ⏸️ **Congelado até e/f + §6.4 lidos:** correção em fases **por classe** (K primeiro — zero
   impacto em texto descritivo): `version(n)` idempotente no app + migração SQL estendida no
   padrão `reconcile_*` (public: no-op se limpo · staging: Caso B).
4. Gate por classe (quando as Fases C/D forem aprovadas): `tsc -b --noEmit` + `vitest run`
   (144) + contagem/checksum antes/depois.

### 6.6 ETAPA 1 — RESULTADO EXECUTADO (query f, 2026-08-06)

**Retorno bruto (24 linhas — `public` retornou **0** → schema de produção 100% minúsculo):**

| table_schema | table_name | column_name | data_type |
|---|---|---|---|
| `staging` | `assets` | `CENTRODECUSTO` | text |
| `staging` | `assets` | `CNPJ` | text |
| `staging` | `assets` | `CONTACONTABIL` | text |
| `staging` | `assets` | `DATAAQUSIC` | text |
| `staging` | `assets` | `DATABAIXA` | text |
| `staging` | `assets` | `DESCRICAODOATIVO` | text |
| `staging` | `assets` | `EMPRESA` | text |
| `staging` | `assets` | `ENDERECO` | text |
| `staging` | `assets` | `ESTADO_CONSERVACAO` | text |
| `staging` | `assets` | `ETIQUETA` | text |
| `staging` | `assets` | `NOMEFORNECEDOR` | text |
| `staging` | `assets` | `NOTAFISCAL` | text |
| `staging` | `assets` | `PRIMARYKEY` | text |
| `staging` | `assets` | `QT` | text |
| `staging` | `assets` | `REGISTRO` | text |
| `staging` | `assets` | `SERIAL` | text |
| `staging` | `assets` | `STATUS` | text |
| `staging` | `assets` | `SUBREG` | text |
| `staging` | `assets` | `Sn1_recno` | bigint |
| `staging` | `assets` | `TAG_INVENTARIO` | text |
| `staging` | `assets` | `VLRAQUISIC` | text |
| `staging` | `assets` | `_campaignId` | uuid |
| `staging` | `assets` | `_origemTransacao` | text |
| `staging` | `assets` | `_tenantId` | text |

**Classificação por coluna (base para a Fase D, por classe):**

| Coluna em `staging.assets` | Tipo | Classe | Mapeamento canônico | Observação |
|---|---|---|---|---|
| `CENTRODECUSTO` | text | K | `centrodecusto` | UPPER verbatim |
| `CNPJ` | text | K | `cnpj` | UPPER verbatim |
| `CONTACONTABIL` | text | K | `contacontabil` | UPPER verbatim |
| `DATAAQUSIC` | text | K | `dataaqusic` | UPPER + **typo do Excel** (falta o `I`); `DATAAQUISIC` e `DATAAQUSIC` são ambos sinônimos em `SCHEMA_PRIORITY.DATE` |
| `DATABAIXA` | text | K | `databaixa` | UPPER verbatim |
| `DESCRICAODOATIVO` | text | T | `descricaodoativo` | UPPER verbatim |
| `EMPRESA` | text | K | `filial` | sinônimo do grupo `GROUP` (`SCHEMA_PRIORITY`) |
| `ENDERECO` | text | K | `endereco` | achado original (D5) |
| `ESTADO_CONSERVACAO` | text | aux | — (fora do contrato 21) | consta em `DB_ASSET_COLUMNS`, sem grupo de prioridade |
| `ETIQUETA` | text | K | `etiqueta` | UPPER verbatim |
| `NOMEFORNECEDOR` | text | T | `nomefornecedor` | UPPER verbatim |
| `NOTAFISCAL` | text | K | `notafiscal` | UPPER verbatim |
| `PRIMARYKEY` | text | K | `primarykey` | UPPER verbatim |
| `QT` | text | N | `qt` | UPPER verbatim — ⚠️ **tipo `text`** (contrato: number) |
| `REGISTRO` | text | K | `registro` | UPPER verbatim |
| `SERIAL` | text | K | `serial` | UPPER verbatim |
| `STATUS` | text | T | `status` | UPPER verbatim |
| `SUBREG` | text | K | `subreg` | UPPER verbatim |
| `Sn1_recno` | bigint | N | `sn1_recno` | mixed-case (quoted identifier) |
| `TAG_INVENTARIO` | text | K | `tag` | sinônimo em `DB_ASSET_COLUMNS` |
| `VLRAQUISIC` | text | N | `vlraquisic` | UPPER verbatim — ⚠️ **tipo `text`** (contrato: number) |
| `_campaignId` | uuid | interno | — | **não existe no `src/`** (app usa `currentCampaignId`) — shape antigo/estrangeiro |
| `_origemTransacao` | text | interno | — | **campo real do app** (camelCase): `App.tsx:4234,4422,4811` · `AssetDetail.tsx:710` · `AssetMap.tsx:113` |
| `_tenantId` | text | K | `tenantid` | **não existe no `src/`** (app usa `tenantid`) — shape antigo/estrangeiro |

**Conclusões SRE (auditoria estrutural — risco zero mantido, nada alterado):**

1. `public.assets` = **0 variantes de case** → schema de produção **100% canônico** (todas
   minúsculas). A Fase D permanece **no-op** no `public`.
2. `staging.assets` = **espelho verbatim da planilha Excel** (quoted identifiers): 16 UPPER de
   canônicos + 3 sinônimos (`DATAAQUSIC` com typo, `EMPRESA`, `TAG_INVENTARIO`) + 1 auxiliar
   (`ESTADO_CONSERVACAO`) + `Sn1_recno` mixed-case + 3 camelCase. A hipótese de "dupla
   importação" de **2026-08-06 está CONFIRMADA e GENERALIZADA** (D7).
3. ⚠️ **Divergência de tipo:** `QT` e `VLRAQUISIC` são `text` no staging (importação crua) vs
   `number` no contrato do app — qualquer consumo futuro do staging exigiria cast.
4. `_campaignId`/`_tenantId` ausentes no `src/` indicam escrita por **shape antigo/estrangeiro**
   (não é o app atual); `_origemTransacao` é o único camelCase genuíno do app.
5. **Fase D (se aprovada) — escopada ao `staging`:** (1) decidir canônico por coluna (reutilizar
   minúsculas existentes vs gerar das UPPER); (2) cast/`text`→`number` de `QT`/`VLRAQUISIC` se o
   staging for consumido; (3) `DROP` das 24 variantes após merge, no padrão `reconcile_*`.
   Pendências menores: contagens (a)/(b) e origem do schema.

### 6.7 ETAPA 1 — RESULTADO EXECUTADO (query e, 2026-08-06) — contagem real e o "26"

**`public.assets` = 26 colunas, 100% minúsculas — o "26" do operador está RESOLVIDO: é o shape
canônico de produção (21 do contrato + 5 de infra/sync):**

| Coluna | Tipo | Origem |
|---|---|---|
| `id` | text | infra (PK texto do app) |
| `tenantid` | text | contrato 21 |
| `filial` | text | contrato 21 |
| `status` | text | contrato 21 |
| `etiqueta` | text | contrato 21 |
| `qt` | integer | contrato 21 |
| `descricaodoativo` | text | contrato 21 |
| `serial` | text | contrato 21 |
| `dataaqusic` | text | contrato 21 |
| `cnpj` | text | contrato 21 |
| `nomefornecedor` | text | contrato 21 |
| `notafiscal` | text | contrato 21 |
| `endereco` | text | contrato 21 |
| `registro` | text | contrato 21 |
| `subreg` | text | contrato 21 |
| `databaixa` | text | contrato 21 |
| `contacontabil` | text | contrato 21 |
| `primarykey` | text | contrato 21 |
| `centrodecusto` | text | contrato 21 |
| `vlraquisic` | numeric | contrato 21 |
| `sn1_recno` | integer | contrato 21 |
| `sn3_recno` | integer | contrato 21 |
| `created_at` | timestamptz | infra |
| `updated_at` | timestamptz | infra |
| `_is_synced` | boolean | sync |
| `_is_deleted` | boolean | sync |

✅ **Conclusão `public`:** 26/26 minúsculas, tipos corretos — **zero anomalia estrutural.
Fase D = NO-OP no public (definitivo).**

**`staging.assets` = 58 colunas — schema DIVERGENTE, 3 gerações de shape:**

| Grupo | Qtd | Exemplos |
|---|---|---|
| **Case-variants (quoted/verbatim Excel)** | 24 | `ENDERECO`, `ETIQUETA`, `DATAAQUSIC` (typo), `Sn1_recno`, `_campaignId`, `_origemTransacao`, `_tenantId` |
| **Canônicos minúsculos (parcial)** | 17 | `endereco`, `etiqueta`, `dataaqusic`, `cnpj`… — ⚠️ `qt` = **text** (public: integer) |
| **Infra** | 3 | `id` (**bigint** — public: text), `created_at`, `updated_at` |
| **Legado/experimental** | 14 | `_unitid` (removida no app), `_tenantid`, `_origemtransacao`, `conferido`, `is_new`, `descricao_master`, `plaqueta_master`, `local_master`, `empresa`, `empresa_normalizada`, `tag_duplicidade`, `tag_inventario`, `base_sintetica_loc` (jsonb), `campos_alterados` (jsonb) |

(17 + 3 + 24 + 14 = 58 ✓) — **Ausentes no staging:** `sn1_recno`/`sn3_recno` minúsculos,
`_is_deleted`, `_is_synced`.

**Análise SRE (fecha a auditoria estrutural — risco zero mantido):**

1. **`public.assets` está perfeito** (26/26). A produção do app nunca esteve exposta a nenhuma
   variante — a higienização de case **não tem o que fazer no schema de produção**.
2. **`staging.assets` é um acumulado de 3 gerações:** importação crua do Excel (24 quoted),
   shape canônico parcial (17+3) e shape legado do app (`_unitid` — coluna já removida do app/
   Supabase —, `conferido`/`is_new` vs `_conferido`/`_isNew`, camelCases) + experimentos
   (`base_sintetica_loc`, `campos_alterados`, `empresa_normalizada`, `tag_duplicidade`).
3. **Zero referências a `staging` no repositório (grep = 0)** → schema **morto** para o app.
4. **Recomendação SRE — Fase D reformulada:** NÃO reconciliar coluna a coluna no staging (o
   padrão `reconcile_*` serve para tabela ativa com variante pontual; aqui são 58 colunas de 3
   gerações). Opções, em ordem de preferência:
   a. **Congelar como histórico** (status quo — zero custo/risco); ou
   b. **Drop da tabela/schema** após aprovação e backup (fora da arquitetura, 0 consumidores); ou
   c. Se existir pipeline futuro que consuma `staging`: **recriar com o shape canônico do
      `public` (26)** em vez de migrar o atual.
5. **1 decisão pendente desbloqueia a Fase D:** existe pipeline/consulta/ferramenta fora do
   repositório que leia `staging.assets`? (origem do schema — pendência original D6).
