-- ============================================================================
-- reset-base-tenant.sql — RESET DA BASE DE UM CONTRATO (Fase 3)
--
-- Uso (⚠ destrutivo e irreversível — faça backup antes):
--
--   psql "$SUPABASE_DB_URL" -v tenantid=CICOPAL -f scripts/reset-base-tenant.sql
--
-- O QUE É APAGADO (só do contrato indicado):
--   • public.asset_logs         — trilha dos ativos deste contrato;
--   • public.assets             — os ativos (é o que a planilha vai repor);
--   • public.campaign_snapshots — laudos fechados das campanhas deste contrato;
--   • public.campaigns          — as campanhas deste contrato.
--
-- O QUE NÃO É TOCADO (de propósito):
--   • public.unit_configs e public.locations — cadastro da unidade, não é
--     inventário; apagar obrigaria a reconfigurar âncoras de GPS e regras;
--   • public.audit_logs — histórico de quem fez o quê, incluindo esta limpeza;
--   • public.user_permissions e public.inventory_config — acesso e configuração.
--
-- A comparação do contrato ignora caixa e espaços (`CICOPAL` = ` cicopal `),
-- porque a carga grava o `tenantid` em maiúsculas e há linhas legadas com
-- espaços. As tabelas sem FK entre si: a ordem dos DELETE só mantém a lógica.
-- ============================================================================
\set ON_ERROR_STOP on

\if :{?tenantid}
\else
  \echo 'ERRO: informe o contrato. Ex.: psql ... -v tenantid=CICOPAL -f scripts/reset-base-tenant.sql'
  \quit 3
\endif

\echo '>>> Contrato:', :'tenantid'

BEGIN;

-- Fotografia ANTES (vai para o terminal; serve de prova do reset).
SELECT 'ANTES' AS fase,
       (SELECT count(*) FROM public.assets
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS ativos,
       (SELECT count(*) FROM public.campaigns
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS campanhas,
       (SELECT count(*) FROM public.campaign_snapshots
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS laudos,
       (SELECT count(*) FROM public.asset_logs
         WHERE upper(btrim(coalesce(tenantid, tenant_id, ''))) = upper(btrim(:'tenantid'))) AS logs;

DELETE FROM public.campaign_snapshots
 WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'));

DELETE FROM public.asset_logs
 WHERE upper(btrim(coalesce(tenantid, tenant_id, ''))) = upper(btrim(:'tenantid'));

DELETE FROM public.assets
 WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'));

DELETE FROM public.campaigns
 WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'));

-- Fotografia DEPOIS: tudo a zero é o estado esperado antes de reimportar.
SELECT 'DEPOIS' AS fase,
       (SELECT count(*) FROM public.assets
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS ativos,
       (SELECT count(*) FROM public.campaigns
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS campanhas,
       (SELECT count(*) FROM public.campaign_snapshots
         WHERE upper(btrim(coalesce(tenantid, ''))) = upper(btrim(:'tenantid'))) AS laudos,
       (SELECT count(*) FROM public.asset_logs
         WHERE upper(btrim(coalesce(tenantid, tenant_id, ''))) = upper(btrim(:'tenantid'))) AS logs;

COMMIT;

\echo '>>> Reset concluído. Reimporte a planilha no Gestor de Base e confira "planilha N · base N".'
