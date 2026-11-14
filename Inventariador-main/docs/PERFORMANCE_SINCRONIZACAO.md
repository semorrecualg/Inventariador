# Performance das três filas de sincronização (carga de ~7.000 ativos)

Diagnóstico e correções aplicadas nos três fluxos de grande volume. Todos os
números abaixo são do código que corria antes desta revisão; nenhum benchmark
foi medido em produção — o que se mede agora são os logs novos (ver § 5).

---

## 1. Tela A — espelhamento em massa (Supabase)

**Onde:** `src/services/supabaseService.ts` → `syncAssetsToCloud`.

**Antes**

| Item | Valor |
|---|---|
| Lote por requisição | 50 linhas |
| Ritmo | 100% sequencial, com `await new Promise(r => setTimeout(r, 40))` por lote |
| Requisições para 7.000 ativos | 140 (mais 40 ms de espera cada) |
| Falha de um lote | fallback **linha a linha**, 50 `await` sequenciais por lote |

Cada lote custa RTT + commit no Postgres, e o progresso cresce linearmente com o
número de lotes. O caso mais caro era o fallback: um lote rejeitado trocava 1
requisição por 50. Com 2.450 linhas em 90 minutos (~6,6 s por lote de 50), o
tempo por linha é compatível com o caminho de isolamento ativo-a-ativo, não com
um upsert de bloco — hipótese confirmada pelos logs novos (`Lote N falhou…`).

**Depois**

- 500 linhas por requisição (≈0,5 MB de corpo, folga no limite do PostgREST).
- 4 lotes em voo (coroutines controladas) → ~2.000 linhas por rodada.
- Removido o `setTimeout(40)` por lote.
- Progresso monotónico: conta linhas de lotes **concluídos**.
- Fallback só depois de um lote falhar, com 8 linhas em voo em vez de 50
  sequenciais.
- Alvo do `ON CONFLICT`: `(tenantid, id)` e, se o schema legado responder
  `42P10`/`22P02` (`id` uuid / índice ausente), uma repetição por
  `(tenantid, primarykey)` — em vez de degradar 500 linhas para 500 pedidos.
- Log final: total enviado, lotes, segundos e ativos/s.

7.000 ativos passam de **140 idas à rede** para **14**, em 4 ondas.

### 1.1 `assets.id` é uuid — a causa de "0 sincronizados, 7.061 rejeitados"

O bootstrap declara `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, mas a chave
de origem do inventário é texto (`0101010000004969001`). O payload enviava essa
string em `id`, o Postgres recusava **todas** as linhas com
`22P02 invalid input syntax for type uuid` e o `PostgrestError` (que não é um
`Error`) aparecia como `[object Object]`, escondendo a causa.

Correções:

- **UUID derivado (v5)** de `(tenantid, primarykey)`: respeita o tipo da coluna e
  é estável entre execuções, mantendo o upsert idempotente em
  `onConflict: 'tenantid, id'`. Modo aprendido uma vez por sessão (a fila não
  repete o lote falhado a cada 1,2 s).
- **23505** em `assets_tenant_primarykey_key` = a chave de origem já existe na
  nuvem: contada como **sincronizada**, não como rejeitada.
- **PGRST204** (coluna inexistente no schema remoto): a coluna é retirada do
  payload e o lote repetido, em vez de derrubar as 500 linhas.
- **Mensagens legíveis:** `descreveSupabaseError` extrai `code · message ·
  details · hint`, e o exemplo do erro final mostra a causa real.
- **Dedupe por `(tenantid, primarykey)`** dentro do lote: chave repetida fazia o
  Postgres abortar com "ON CONFLICT DO UPDATE command cannot affect row a second
  time".
- **Marcação local pela chave de origem:** `markAssetsSynced` casa pelo
  `primarykey`, mas o retorno do sync trazia `id`; quando `id !== primarykey` a
  etiqueta não limpava mesmo com o dado aceite. A conversão passou a ser feita
  em `syncAssetsToCloudAndMark`.

**RPC nativa (avaliada, não adotada ainda):** o `upsert` do PostgREST já é um
único `INSERT … ON CONFLICT` no Postgres, portanto o ganho de uma função
`plpgsql` não está na escrita — está em juntar vários lotes num só corpo. Com
500 linhas por pedido e 4 em voo, 7.000 ativos cabem em 14 pedidos (4 ondas).
Uma RPC `gbr_upsert_assets(p_assets jsonb)` reduziria a ~4 pedidos, ao custo de
versionar SQL no banco (deploy + permissões). Fica como próximo passo se o
gargalo passar a ser o número de idas, e não o commit no Postgres.

---

## 2. Tela B — persistência local ("MODO IMPORTAÇÃO ATIVO")

**Onde:** `src/services/persistenceService.ts`, `src/services/sqliteService.ts`,
`src/services/localDbService.ts`, `src/services/supabaseService.ts`.

**Antes**

1. `saveCollectedAssetAtomic` (conferência/coleta) abria uma transação por item
   e, logo depois, fazia `db.local_assets.toArray()` + `JSON.stringify(base
   inteira, null, 2)` + `Filesystem.writeFile` + um segundo backup completo. Com
   7.000 ativos: **7.000 dumps de 7.000 linhas** (O(n²) de I/O por turno).
2. `localDb.assets.put` acumulava 10 operações e, no flush, fazia 3 `put` por
   item + 1 `put` de log por item.
3. `bulkInsertAssetsOfflineFirst` usava 200 linhas por `bulkPut` (herança do
   motor SQL legado, já purgado).
4. O download da base paginava de 200 em 200 (`fetchFullInventory`).

**Depois**

- Espelho físico **coalescido**: uma escrita por janela de 1,2 s, serializada e
  sempre com o estado mais recente; no browser nem corre (não há Filesystem
  nativo, era trabalho sem destino).
- Flush do buffer: um `bulkPut` por tabela e um `bulkPut` de logs dentro da
  mesma transação (3 operações por lote de 10, em vez de 40).
- Import local: 1.000 linhas por `bulkPut`, ainda dentro de **uma única
  transação** Dexie (7 ondas para 7.000, em vez de 35).
- Download da base: 1.000 linhas por página (7 idas à rede, em vez de 35).

**Sobre "desativar índices durante a carga":** o banco local é IndexedDB via
Dexie, não SQLite com DDL. Os índices são declarados no schema e não existe
`DROP INDEX` em runtime — a alavanca equivalente é reduzir o número de
transações e de operações por transação, que é o que foi feito. A chave primária
de cada store continua a ser `[tenantid+primarykey]`, o que mantém o upsert
idempotente e barato.

---

## 3. Tela C — etiqueta "PENDENTE NUVEM"

**Onde:** `src/App.tsx` (`updateAsset`, `commitAssetUpdate`,
`bulkUpdateAssets`), `src/components/Inventory.tsx`,
`src/services/persistenceService.ts`, `src/services/sqliteService.ts`.

**Antes** — a etiqueta não media "fila de envio": media quatro bloqueios
encadeados.

1. `handleUpdateAssetWithBackup` fazia `getItem` + `JSON.parse` + `filter` +
   `push` + `JSON.stringify` do array **inteiro** de contingência a cada
   conferência. Com milhares de ativos, dezenas de ms de main thread por toque,
   a crescer linearmente.
2. `updateAsset` esperava `telemetryService.getDeviceMetrics()` e o GPS (até
   **3 s**) **antes** de gravar e antes de pintar o cartão.
3. `commitAssetUpdate` disparava um `upsert` individual por confirmação **e** a
   auto-sincronização de 3 s voltava a enviar os mesmos registos.
4. No fim, `setRefreshVersion(+1)` obrigava dois effects a reler e reparsear a
   base da unidade — por cada confirmação.
5. `_is_synced` nunca voltava a 1: só o download da base o fazia. O upsert
   acontecia, mas a etiqueta ficava amber até um novo pull.

**Depois**

- Resguardo em `localStorage` coalescido (uma fusão por janela de 800 ms, com
  flush em `visibilitychange`).
- GPS fora do caminho crítico: o Dexie e o estado visual são escritos no toque;
  a posição (até 3 s) chega depois, completa o registo por `patchAsset` e só
  então entra na fila da nuvem.
- **Fila de envio coalescida**: buffer por id, janela de 1,2 s, um único
  `syncAssetsToCloud` por janela (que já vai em lotes de 500/4 em voo), reenvio
  em `online` e recuo de 5 s em erro.
- Quando o Postgres aceita, `sqliteService.markAssetsSynced(ids)` marca
  `_is_synced = 1` numa única transação e o estado em memória é corrigido por
  `map` — **sem `setRefreshVersion` e sem reler a base**.
- `bulkUpdateAssets` deixou de esperar a rede: persiste localmente, pinta, e
  entrega o lote à mesma fila.
- Sincronização manual (`syncPendingAssets`) e auto-sincronização usam
  `syncAssetsToCloudAndMark`, para o estado local acompanhar a nuvem.

---

## 4. O que **não** mudou

- Contratos de isolamento por `tenantid` (chave composta e `onConflict`).
- Regra fiscal da conta `131105001`.
- Formato dos ficheiros de backup e chaves de `localStorage`.
- Fluxo de confirmação, unitização, adoção e exclusão.
- Nenhuma dependência nova, nenhum `eslint-disable`, nenhum `@ts-ignore`.

---

## 5. Como verificar no terreno

- Carga de 7.000: o log final passa a mostrar
  `Espelhamento: N/7000 ativos em 14 lote(s) de 500 · Xs (Y ativos/s)`.
- Falha de schema: `Lote N falhou; 500 linha(s) reenviadas em isolamento.
  Causa: [CÓDIGO] mensagem · detalhe · dica` — a causa do Postgres aparece
  legível; `assets.id` uuid é detetado e resolvido automaticamente.
- Avisos esperados uma vez por sessão: `assets.id é uuid ...` e
  `Coluna 'x' não existe em assets ...`.
- Confirmação: o cartão muda de estado no toque (sem esperar GPS) e
  `PENDENTE NUVEM` passa a `SINCRONIZADO` após a janela de envio, sem recarregar
  a lista.
- Importação: a sobreposição `MODO IMPORTAÇÃO ATIVO` deve terminar sem o
  congelamento que vinha do dump integral do disco a cada ativo.
- F0 (linha de base): cada operação emite
  `>>> [PERF] boot|pull.full|pull.delta|push: Nms · N registro(s)`. As últimas
  200 amostras ficam em `gbr_perf_samples_v1`. **Gestor de Base → Linha de Base
  (F0)** grava `gbr_perf_baseline_v1` com p50/p95 e a contagem por espelho
  (`local_assets` / `ativos` / `assets`) — automaticamente no fim do boot e de
  cada pull completo (contagem em momento ocioso), ou pelo botão Registrar. **Copiar** e **Exportar** devolvem
  o snapshot em JSON para enviar no suporte.
