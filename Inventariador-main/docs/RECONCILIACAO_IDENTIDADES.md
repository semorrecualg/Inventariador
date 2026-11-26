# Reconciliação de identidades — nuvem ↔ aparelho

> **Item 21** da avaliação do «duplicate key» e do «Tempo esgotado» (documento
> de trabalho da agenda, fora do repositório). Este documento é **diagnóstico
> read-only**: não escreve, não apaga e não renumera chaves. A decisão sobre as
> cópias é de produto e toma-se **com os números** que estas consultas devolvem.

O problema que isto mede: a Unidade Operacional chegou a mostrar **50.544**
linhas onde a nuvem tem **12.636** (`src/utils/assetKey.ts` conta a origem —
grafias diferentes da mesma chave viravam linhas novas). Antes de decidir o que
fazer com essas linhas, é preciso saber **quantas são cópia legítima e quantas
são resíduo de importação antiga**.

---

## 1. As duas identidades que existem no app

| identidade | como se forma | onde manda |
| --- | --- | --- |
| **Chave de escrita** | `primarykey` canónica — `sanitizeAssetKey`: `trim` + `UPPER` + só `A-Z 0-9 -` (`src/utils/assetKey.ts`) | unicidade da nuvem: índice único `assets_tenant_primarykey_key (tenantid, primarykey)` |
| **Identidade de conteúdo** | `TENANT\|FILIAL\|ETIQUETA`, com `normalizeKey` e etiquetas-placeholder excluídas (`assetIdentityKey`, `src/utils/dedupAssets.ts`) | diagnóstico: mostra etiquetas repetidas sem bloquear envio (`src/utils/cloudPushGuard.ts`) |
| **Chave derivada** | `SEM-ETIQUETA-<hash>` quando a planilha não traz identidade (`fallbackAssetKey`) | determinística por tenant/filial/conteúdo — **não** é aleatória, mas também não é identidade do ERP |

Duas linhas com a **mesma etiqueta** e `primarykey`s diferentes são registos
**distintos** e sobem as duas (é a regra do produto: perder registo é proibido).
O que se procura aqui é outra coisa: a **mesma linha** a existir mais de uma vez.

---

## 2. Lado da nuvem (SQL Editor do Supabase — só `select`)

### 2.1 Dimensão por contrato

```sql
select tenantid,
       count(*)                                        as linhas,
       count(*) filter (where is_deleted)              as apagadas,
       count(distinct primarykey)                      as chaves_distintas
from public.assets
group by tenantid
order by linhas desc;
```

Se `linhas` for muito maior do que `chaves_distintas`, há chaves repetidas — mas
o índice único impede isso (ver 2.2); o mais provável é serem contratos
diferentes com a mesma base copiada.

### 2.2 Chaves repetidas na nuvem (deve devolver zero linhas)

```sql
select tenantid, primarykey, count(*) as linhas
from public.assets
group by 1, 2
having count(*) > 1
order by 3 desc
limit 50;
```

O índice `assets_tenant_primarykey_key` garante zero. **Se devolver linhas**, o
índice não está aplicado nessa base: é a primeira coisa a corrigir
(`docs/supabase_bootstrap.sql`, secção 1), não a reconciliar.

### 2.3 Identidade repetida — o sinal real das cópias

```sql
select upper(btrim(tenantid)) as tenantid,
       upper(btrim(filial))   as filial,
       upper(btrim(etiqueta)) as etiqueta,
       count(*)               as linhas,
       array_agg(primarykey order by primarykey) as chaves
from public.assets
where etiqueta is not null
  and upper(btrim(etiqueta)) not in ('ETIQUETAR', 'SEM ETIQUETA', '0', 'S/N')
group by 1, 2, 3
having count(*) > 1
order by linhas desc
limit 50;
```

É a mesma regra de `assetIdentityKey`. Cada linha devolvida é uma decisão: duas
linhas legítimas da planilha, ou a mesma linha importada duas vezes.

### 2.4 Chaves derivadas (resíduo de planilha sem identidade)

```sql
select tenantid, count(*) as derivadas
from public.assets
where primarykey like 'SEM-ETIQUETA-%'
group by 1
order by 2 desc;
```

Cada chave destas nasceu de uma linha sem `primarykey`, sem `etiqueta` e sem
`tag`. É o sinal mais forte de importação antiga.

### 2.5 Quanto a canonicalização colapsaria

```sql
select count(*) as linhas,
       count(distinct regexp_replace(upper(btrim(primarykey)), '[^A-Z0-9-]', '', 'g')) as chaves_canonicas
from public.assets
where tenantid = 'CICOPAL';
```

Se `chaves_canonicas` for menor do que `linhas`, há grafias que a chave canónica
junta (`ABC 1`, `abc1`, `ABC-1`) — resíduo anterior à regra única de chave, no
lado da nuvem.

### 2.6 Exportar as chaves de um contrato (para cruzar com o aparelho)

```sql
select primarykey
from public.assets
where tenantid = 'CICOPAL'
order by primarykey;
```

---

## 3. Lado do aparelho

O app exporta o inventário local em JSON (**Dados → Exportar Backup**,
`backupInventory` em `src/services/persistenceService.ts`): o ficheiro tem
`{ version, mode, timestamp, assets: [...], config }`, com as linhas do
inventário carregado.

No computador, extrair as chaves distintas:

```bash
jq -r '.assets[].primarykey // empty' backup_v24.json | sort -u > local_keys.txt
wc -l local_keys.txt          # nº de chaves distintas no aparelho
jq '.assets | length' backup_v24.json   # nº de linhas (o número que a Unidade Operacional mostra)
```

A diferença entre os dois números já diz muito: se `assets | length` for muito
maior do que as chaves distintas, o aparelho tem linhas repetidas por grafia.

---

## 4. Cruzamento

### 4.1 Na nuvem e não no aparelho

Cole em `values (...)` as chaves do `local_keys.txt` (blocos de ~500 linhas por
consulta):

```sql
with local(primarykey) as (
  values ('00000005097'), ('00000005098')
)
select a.tenantid, a.primarykey, a.filial, a.etiqueta, a.is_deleted, a.updated_at
from public.assets a
where a.tenantid = 'CICOPAL'
  and not exists (select 1 from local l where l.primarykey = a.primarykey)
order by a.primarykey
limit 200;
```

Estas linhas existem na nuvem e não no aparelho: ou são de outro contrato
(confirmar `tenantid`), ou o aparelho nunca fez pull completo.

### 4.2 No aparelho e não na nuvem

Inverso — a lista de chaves vem da consulta 2.6 exportada para CSV:

```sql
with nuvem(primarykey) as (
  values ('00000005097'), ('00000005098')
)
select l.primarykey
from (values ('00000005097'), ('00000005098')) as l(primarykey)
where not exists (select 1 from nuvem n where n.primarykey = l.primarykey);
```

Na prática é mais simples fazer isto fora do SQL: `comm -23 local_keys.txt
cloud_keys.txt` depois de ordenar os dois ficheiros. **Estas são as candidatas a
lixo de importação antiga.**

---

## 5. Como classificar cada caso

| sinal | leitura | ação |
| --- | --- | --- |
| `SEM-ETIQUETA-…` e a mesma descrição/`registro` existe com chave real | linha sem identidade na planilha, importada antes do `fallbackAssetKey` determinístico | lixo de importação antiga — apagar exige PR próprio e backup |
| mesmo `TENANT\|FILIAL\|ETIQUETA`, `primarykey`s diferentes, campos do ERP diferentes | duas linhas da planilha (ex.: duas unidades do mesmo bem) | **legítimo** — não tocar |
| mesmo `TENANT\|FILIAL\|ETIQUETA`, `primarykey`s diferentes, campos iguais | a mesma linha importada duas vezes | cópia — decidir por contrato, com números |
| mesmo `primarykey` em `tenantid` diferentes | base de teste copiada de outro contrato (ex.: CLIENTETESTE ← CICOPAL) | **legítimo** — o modelo é multi-tenant por desenho |
| grafias que colapsam na chave canónica (2.5) | resíduo anterior à regra única de chave | migração de chaves, nunca à mão |
| `is_deleted = true` com par local ativo | exclusão que não desceu ao aparelho | não é cópia: é pull pendente |

---

## 6. O que fazer — e o que não fazer

**Fazer, nesta ordem:**

1. Correr 2.1–2.5 e 3 (contagens, sem tocar em dados).
2. Cruzar (secção 4) e classificar cada linha pela tabela acima.
3. Levar os números à decisão de produto: quantas cópias, em que contratos, de
   que tipo.
4. Só depois: PR dedicado (migração de chaves ou limpeza de resíduo), com
   backup, com autorização explícita e com o roteiro de campo do item 17 feito.

**Não fazer:**

- Não renumerar `primarykey` nem introduzir identificador substituto.
- Não apagar/limpar `ativos` ou `local_assets` para «começar limpo».
- Não correr `delete`/`update` a partir deste documento: todas as consultas aqui
  são `select`.

---

## 7. Limites deste ambiente

As consultas **não foram executadas**: não há Supabase nem credenciais neste
ambiente, e nenhum número deste documento é medição — os 50.544 / 12.636 vêm do
comentário de `src/utils/assetKey.ts`. As consultas seguem o schema de
`docs/supabase_bootstrap.sql` (colunas `id`, `tenantid`, `filial`, `etiqueta`,
`primarykey`, `is_deleted`, `updated_at`); numa base sem alguma coluna a consulta
falha e nada é alterado.
