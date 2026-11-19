-- ============================================================================
-- DIAGNÓSTICO DA CONFERÊNCIA — public.assets (SOMENTE LEITURA)
-- ============================================================================
-- Companheiro de scripts/assets-conferencia.sql, que cria as colunas
-- `conferido` (boolean), `auditor` (text) e `data_leitura` (text), faz o
-- backfill do marcador legado (`status` com CONFERIDO) e cria o índice
-- `assets_tenant_conferido_idx`.
--
-- Este ficheiro NÃO escreve nada: pode ser colado inteiro no SQL Editor e
-- repetido à vontade, sem efeito colateral. A guarda automática
-- (`src/__tests__/diagnosticoConferencia.test.ts`) falha se aqui aparecer
-- INSERT/UPDATE/DELETE/ALTER/DROP/CREATE.
--
-- COMO USAR
--   1) Supabase → SQL Editor, ou no seu terminal:
--      psql "$SUPABASE_DB_URL" -f scripts/assets-conferencia-diagnostico.sql
--      (a connection string é segredo: nunca em código, commit ou chat)
--   2) Execute o ficheiro inteiro. Cada bloco traz, no comentário ao lado, o
--      resultado esperado e o que fazer quando não bate.
--   3) O BLOCO E é o veredicto: uma linha por verificação, com `ok`.
--
-- O passo a passo e a leitura de cada resultado estão em
-- docs/DIAGNOSTICO_CONFERENCIA.md.
-- ============================================================================


-- ============================================================================
-- BLOCO A — O script de migração correu?
-- ============================================================================

-- A.1 — as três colunas existem, com o tipo e o default certos
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'assets'
   AND column_name  IN ('conferido', 'auditor', 'data_leitura')
 ORDER BY column_name;
-- Esperado: 3 linhas — auditor text, conferido boolean (default false),
-- data_leitura text.
-- Menos que 3 → falta correr scripts/assets-conferencia.sql.

-- A.2 — o índice da consulta por contrato existe
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename  = 'assets'
   AND indexname  = 'assets_tenant_conferido_idx';
-- Esperado: 1 linha.
-- Vazio → a tela de CONFERIDOS varre a tabela inteira por contrato.

-- A.3 — nenhuma linha ficou com a flag nula
SELECT count(*) AS conferido_nulo
  FROM public.assets
 WHERE conferido IS NULL;
-- Esperado: 0.
-- >0 → o backfill de assets-conferencia.sql não terminou (a coluna nasceu sem
-- DEFAULT numa versão anterior); repetir o ficheiro da migração.


-- ============================================================================
-- BLOCO B — A nuvem concorda com a regra do app?
-- ============================================================================

-- B.1 — backfill em atraso: o marcador legado diz CONFERIDO e a flag não
SELECT count(*) AS pendentes_de_backfill
  FROM public.assets
 WHERE conferido IS DISTINCT FROM true
   AND (UPPER(COALESCE(status, '')) LIKE '%CONFERIDO%'
        OR UPPER(COALESCE(status, '')) = 'SIM');
-- Esperado: 0.
-- >0 → linhas que o app lê como conferidas pelo marcador e a nuvem ainda não
-- marcou: repetir o backfill de scripts/assets-conferencia.sql.
-- Espelho em código: conferidoDaNuvem (src/services/supabaseService.ts) lê
-- `conferido` e o `status` com CONFERIDO, exatamente estes dois sinais.

-- B.2 — quem conferiu e quando (colunas posteriores aos registos antigos)
SELECT count(*) FILTER (WHERE auditor IS NULL)                              AS sem_auditor,
       count(*) FILTER (WHERE data_leitura IS NULL)                         AS sem_data_leitura,
       count(*) FILTER (WHERE auditor IS NOT NULL AND data_leitura IS NULL) AS auditor_sem_data
  FROM public.assets
 WHERE conferido IS TRUE;
-- Informativo, não é falha: as conferências anteriores à migração não têm autor
-- nem data na nuvem. Ficam preenchidas quando o aparelho que as fez voltar a
-- sincronizar, por isso o valor deve descer ao longo dos dias.
-- `auditor_sem_data` > 0 é o único sinal estranho: o app grava os dois juntos.

-- B.3 — datas fora do ISO que o app escreve (new Date().toISOString())
SELECT count(*) AS data_leitura_fora_do_iso
  FROM public.assets
 WHERE conferido IS TRUE
   AND data_leitura IS NOT NULL
   AND data_leitura !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}';
-- Esperado: 0 nas marcações feitas pelo app.
-- >0 = datas legadas gravadas como texto: não quebram nada, mas o BLOCO C.2
-- agrupa pelo prefixo AAAA-MM-DD justamente para não depender do formato.

-- B.4 — as linhas divergentes, para corrigir na origem
SELECT id, tenantid, filial, primarykey, status, conferido, auditor, data_leitura, updated_at
  FROM public.assets
 WHERE conferido IS DISTINCT FROM true
   AND (UPPER(COALESCE(status, '')) LIKE '%CONFERIDO%'
        OR UPPER(COALESCE(status, '')) = 'SIM')
 ORDER BY updated_at DESC NULLS LAST
 LIMIT 50;
-- Deve vir vazio quando B.1 = 0. É a lista exata do que ainda está só no
-- marcador textual.


-- ============================================================================
-- BLOCO C — Volume e ritmo da conferência
-- ============================================================================

-- C.1 — total, conferidos e percentual por contrato e filial
SELECT tenantid,
       COALESCE(NULLIF(filial, ''), '(sem filial)') AS filial,
       count(*)                                      AS total,
       count(*) FILTER (WHERE conferido IS TRUE)     AS conferidos,
       round(100.0 * count(*) FILTER (WHERE conferido IS TRUE) / NULLIF(count(*), 0), 1) AS percentual
  FROM public.assets
 GROUP BY tenantid, filial
 ORDER BY tenantid, total DESC;
-- Deve bater com o painel e com a tela de CONFERIDOS do app para o mesmo
-- contrato/filial. Divergência aqui e lá = pull a ler outra coisa (ver B.1).

-- C.2 — ritmo: conferidos por dia de leitura (14 dias mais recentes)
SELECT left(data_leitura, 10) AS dia,
       count(*)               AS conferidos
  FROM public.assets
 WHERE conferido IS TRUE
   AND data_leitura ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
 GROUP BY left(data_leitura, 10)
 ORDER BY dia DESC
 LIMIT 14;
-- Agrupa pelo prefixo AAAA-MM-DD: não depende de hora nem de fuso, e ignora as
-- datas que o BLOCO B.3 conta como fora do ISO.


-- ============================================================================
-- BLOCO D — Identidade: a chave que o upsert usa
-- ============================================================================

-- D.1 — a mesma chave de origem repetida no mesmo contrato
SELECT tenantid, primarykey, count(*) AS linhas
  FROM public.assets
 WHERE COALESCE(primarykey, '') <> ''
 GROUP BY tenantid, primarykey
HAVING count(*) > 1
 ORDER BY linhas DESC
 LIMIT 20;
-- Esperado: vazio.
-- O envio deduplica por (tenantid, primarykey) e o `id` é derivado dessa chave
-- (buildPayload/sendBatch), por isso uma chave repetida na planilha fica numa
-- linha só na nuvem — é normal a nuvem ter menos linhas que o arquivo.
-- Linhas aqui = escrita antiga por id de origem (`idMode = 'key'`) ou dois
-- aparelhos a carregar a mesma chave ao mesmo tempo.

-- D.2 — linhas sem chave de origem
SELECT count(*) AS sem_chave_de_origem
  FROM public.assets
 WHERE COALESCE(primarykey, '') = '';
-- Esperado: 0.
-- >0 = linhas que o upsert nunca volta a encontrar (o `id` delas nasceu do
-- conteúdo, não da chave). Conferir com D.1 antes de decidir qualquer limpeza.


-- ============================================================================
-- BLOCO E — Veredicto: uma linha por verificação
-- ============================================================================

SELECT 'A.1 colunas de conferência' AS verificacao,
       (SELECT count(*)
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'assets'
           AND column_name  IN ('conferido', 'auditor', 'data_leitura')) = 3 AS ok
UNION ALL
SELECT 'A.2 índice por contrato',
       EXISTS (SELECT 1
                 FROM pg_indexes
                WHERE schemaname = 'public'
                  AND tablename  = 'assets'
                  AND indexname  = 'assets_tenant_conferido_idx')
UNION ALL
SELECT 'A.3 conferido sem nulo',
       NOT EXISTS (SELECT 1 FROM public.assets WHERE conferido IS NULL)
UNION ALL
SELECT 'B.1 backfill em dia',
       NOT EXISTS (SELECT 1
                     FROM public.assets
                    WHERE conferido IS DISTINCT FROM true
                      AND (UPPER(COALESCE(status, '')) LIKE '%CONFERIDO%'
                           OR UPPER(COALESCE(status, '')) = 'SIM'))
UNION ALL
SELECT 'D.1 sem chave de origem repetida',
       NOT EXISTS (SELECT 1
                     FROM public.assets
                    WHERE COALESCE(primarykey, '') <> ''
                    GROUP BY tenantid, primarykey
                   HAVING count(*) > 1)
 ORDER BY verificacao;
-- Esperado: cinco linhas, todas com ok = true.
-- Uma linha com ok = false manda ao bloco correspondente (A.1, A.2, A.3, B.1
-- ou D.1) — o bloco diz o que fazer.
