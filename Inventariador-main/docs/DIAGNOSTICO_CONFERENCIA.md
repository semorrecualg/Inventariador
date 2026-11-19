# Diagnóstico da conferência na nuvem

> **Ficheiro executável:** `scripts/assets-conferencia-diagnostico.sql` (somente leitura).
> **Migração que ele verifica:** `scripts/assets-conferencia.sql`.
> **Regra no app:** `src/utils/conferencia.ts` (`isConferido`).

A conferência tem duas provas: a flag `conferido` na nuvem e o marcador textual
`status` (o `CONFERIDO` que vem da planilha/ERP). O app lê as duas
(`conferidoDaNuvem`, em `src/services/supabaseService.ts`). Quando elas
discordam, o item aparece conferido num lugar e pendente noutro — e é isso que
este diagnóstico mede, sem escrever nada na base.

## Quando correr

1. Depois de aplicar `scripts/assets-conferencia.sql` num ambiente.
2. Antes de abrir a campanha de conferência de uma filial (a contagem da tela
   de CONFERIDOS tem de bater com o bloco C.1).
3. Quando o painel e a tela de CONFERIDOS discordarem para o mesmo
   contrato/filial.
4. Depois de uma carga grande da planilha (blocos C e D).

## Passos

1. **Aplique a migração, se ainda não correu.** No SQL Editor do Supabase, rode
   `scripts/assets-conferencia.sql` inteiro. É idempotente: criar as colunas,
   normalizar os nulos e repetir o backfill não faz mal a quem já o aplicou.
2. **Abra o diagnóstico.** SQL Editor → cole `scripts/assets-conferencia-diagnostico.sql`
   inteiro. Pelo terminal, com a connection string num secret do seu ambiente
   (nunca em ficheiro versionado, commit ou chat):

   ```bash
   psql "$SUPABASE_DB_URL" -f Inventariador-main/scripts/assets-conferencia-diagnostico.sql
   ```

3. **Leia o bloco E primeiro.** São cinco linhas com `ok`. Tudo `true` = a
   nuvem está coerente com a regra do app. Cada `false` aponta o bloco a abrir.
4. **Corrija o que o bloco indicar.** Nada aqui escreve: a correção é sempre um
   dos dois ficheiros de migração (`scripts/assets-conferencia.sql`) ou uma nova
   sincronização a partir do aparelho que fez a conferência.
5. **Repita do passo 2** até o bloco E vir todo `true`, e confirme no app: a tela
   de CONFERIDOS e o painel devem mostrar o mesmo total do bloco C.1 para a
   filial em causa.

## Blocos — pergunta, esperado, o que fazer

| Bloco | Pergunta | Esperado | Se não bater |
|---|---|---|---|
| A.1 | As colunas `conferido`, `auditor`, `data_leitura` existem, com o tipo certo? | 3 linhas | Rode `scripts/assets-conferencia.sql` |
| A.2 | O índice `assets_tenant_conferido_idx` existe? | 1 linha | Rode `scripts/assets-conferencia.sql` (o índice é criado lá) |
| A.3 | Alguma linha ficou com `conferido` nulo? | 0 | Repita o `UPDATE ... WHERE conferido IS NULL` da migração |
| B.1 | Há linhas só com o marcador `status` (CONFERIDO) e sem a flag? | 0 | Repita o backfill da migração; B.4 lista as linhas |
| B.2 | Quantas conferências antigas não têm autor/data na nuvem? | informativo | Desce com a sincronização dos aparelhos; `auditor_sem_data` > 0 é o único sinal estranho |
| B.3 | Há `data_leitura` fora do ISO que o app escreve? | 0 nas marcações novas | Datas legadas: não quebram nada; C.2 agrupa pelo prefixo `AAAA-MM-DD` |
| B.4 | Quais linhas estão divergentes (amostra de 50)? | vazio | É a lista a corrigir; some quando B.1 = 0 |
| C.1 | Total, conferidos e percentual por contrato/filial | bate com o app | Divergência com o app = pull a ler outra coisa: volte a B.1 |
| C.2 | Ritmo: conferidos por dia (14 dias) | série diária | Vazio = nenhuma conferência com data válida no período |
| D.1 | A mesma chave de origem repetida no contrato? | vazio | Ver a nota de identidade abaixo |
| D.2 | Linhas sem chave de origem na nuvem? | 0 | Linhas que o upsert não volta a encontrar; ver D.1 antes de limpar |
| E | Veredicto das verificações acima | 5 linhas, todas `ok` | Abrir o bloco que falhou |

## Identidade: por que a nuvem pode ter menos linhas que a planilha

O envio deduplica por `(tenantid, primarykey)` e deriva o `id` dessa chave
(`buildPayload`/`sendBatch`, em `src/services/supabaseService.ts`). Uma chave de
origem repetida no arquivo — o caso da Fase 2, coberto pela prova
`src/__tests__/provaCargaPlanilha.test.ts` — fica numa linha só na nuvem. Por
isso o bloco D.1 vir vazio é o esperado mesmo com chaves repetidas no arquivo; o
que ele acusa é linha duplicada de verdade (escrita antiga por `id` de origem ou
dois aparelhos a carregar a mesma chave).

## Limites

- É **somente leitura**: não cria, altera nem apaga nada. A guarda
  `src/__tests__/diagnosticoConferencia.test.ts` falha se aparecer DML/DDL.
- Olha só para a nuvem. O que está apenas no aparelho (Dexie/SQLite) não
  aparece aqui; para isso, a comparação é com a tela de CONFERIDOS do app.
- `AUDITOR_STATUS_CONFERENCIA` é coluna da planilha e do app, não do payload
  remoto: o marcador legado que chega à nuvem é o `status` com `CONFERIDO`, e é
  esse que os blocos B.1/B.4 medem.
- O bloco B.2 é informativo de propósito: as colunas `auditor`/`data_leitura`
  nasceram depois das conferências antigas, e o autor/data só voltam quando o
  aparelho que conferiu sincroniza de novo.
- Os resultados dependem de permissão de leitura em `public.assets`; no SQL
  Editor a consulta corre como `postgres` e vê todas as linhas, inclusive de
  outros contratos.
