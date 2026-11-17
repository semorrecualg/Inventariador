-- ============================================================================
-- reset-base-tenant.sql — RESET DA BASE DE UM CONTRATO (Fase 3)
--
-- ONDE CORRER: SQL Editor do Supabase (cole o ficheiro inteiro) ou `psql`.
-- Não usa meta-comandos do psql, por isso funciona também no editor web.
--
-- ⚠ DESTRUTIVO E IRREVERSÍVEL. Faça backup/snapshot do projeto antes.
--
-- COMO USAR: troque o valor da linha marcada "CONTRATO" abaixo e execute.
-- Sem contrato válido o script aborta sem apagar nada (raise exception).
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
-- espaços. As tabelas não têm FK entre si: a ordem dos DELETE só mantém a lógica.
-- ============================================================================

-- ▼▼▼ CONTRATO — troque CICOPAL pelo contrato a limpar ▼▼▼
select set_config('gbr.reset_tenant', 'CICOPAL', false) as contrato;

do $$
declare
  v_tenant     text := upper(btrim(coalesce(current_setting('gbr.reset_tenant', true), '')));
  v_ativos     bigint := 0;
  v_campanhas  bigint := 0;
  v_laudos     bigint := 0;
  v_logs       bigint := 0;
begin
  if v_tenant = '' then
    raise exception 'Contrato vazio: defina o tenantid na primeira linha do script (set_config).';
  end if;

  -- Fotografia ANTES.
  select count(*) into v_ativos from public.assets a
   where upper(btrim(coalesce(a.tenantid, ''))) = v_tenant;
  select count(*) into v_campanhas from public.campaigns c
   where upper(btrim(coalesce(c.tenantid, ''))) = v_tenant;
  select count(*) into v_laudos from public.campaign_snapshots s
   where upper(btrim(coalesce(s.tenantid, ''))) = v_tenant;
  -- `tenant_id` legado é lido por JSON para não falhar se a coluna não existir.
  select count(*) into v_logs from public.asset_logs l
   where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) = v_tenant;

  raise notice 'ANTES  contrato=%  ativos=%  campanhas=%  laudos=%  logs=%',
    v_tenant, v_ativos, v_campanhas, v_laudos, v_logs;

  delete from public.campaign_snapshots s
   where upper(btrim(coalesce(s.tenantid, ''))) = v_tenant;
  get diagnostics v_laudos = row_count;

  delete from public.asset_logs l
   where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) = v_tenant;
  get diagnostics v_logs = row_count;

  delete from public.assets a
   where upper(btrim(coalesce(a.tenantid, ''))) = v_tenant;
  get diagnostics v_ativos = row_count;

  delete from public.campaigns c
   where upper(btrim(coalesce(c.tenantid, ''))) = v_tenant;
  get diagnostics v_campanhas = row_count;

  raise notice 'DEPOIS contrato=%  apagados: ativos=%  campanhas=%  laudos=%  logs=%',
    v_tenant, v_ativos, v_campanhas, v_laudos, v_logs;
end $$;

-- Fotografia DEPOIS: tudo a zero é o estado esperado antes de reimportar.
select 'DEPOIS' as fase,
       (select count(*) from public.assets a
         where upper(btrim(coalesce(a.tenantid, ''))) =
               upper(btrim(coalesce(current_setting('gbr.reset_tenant', true), '')))) as ativos,
       (select count(*) from public.campaigns c
         where upper(btrim(coalesce(c.tenantid, ''))) =
               upper(btrim(coalesce(current_setting('gbr.reset_tenant', true), '')))) as campanhas,
       (select count(*) from public.campaign_snapshots s
         where upper(btrim(coalesce(s.tenantid, ''))) =
               upper(btrim(coalesce(current_setting('gbr.reset_tenant', true), '')))) as laudos,
       (select count(*) from public.asset_logs l
         where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) =
               upper(btrim(coalesce(current_setting('gbr.reset_tenant', true), '')))) as logs;

-- Depois desta execução: Gestor de Base → ZERAR BASE DE DADOS → reimportar a
-- planilha e conferir "planilha N · base N" (docs/FASE3_RESET_E_REIMPORTACAO.md).
