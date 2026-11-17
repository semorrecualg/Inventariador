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
--   • public.campaign_snapshots — laudos fechados das campanhas deste contrato;
--   • public.campaigns          — as campanhas deste contrato;
--   • public.assets             — os ativos (é o que a planilha vai repor);
--   • public.asset_logs         — trilha dos ativos deste contrato.
--
-- O QUE NÃO É TOCADO (de propósito):
--   • public.unit_configs e public.locations — cadastro da unidade, não é
--     inventário; apagar obrigaria a reconfigurar âncoras de GPS e regras;
--   • public.audit_logs — histórico de quem fez o quê, incluindo esta limpeza;
--   • public.user_permissions e public.inventory_config — acesso e configuração.
--
-- ⚠ ORDEM IMPORTA: os ATIVOS são apagados ANTES dos logs. Triggers de auditoria
-- na tabela `public.assets` gravam uma linha em `asset_logs` para cada ativo
-- apagado; se os logs fossem limpos primeiro, essa auditoria do próprio reset
-- voltava a encher a tabela (foi o que deixou 11.441 logs numa execução que
-- limpou os ativos). Apagar os logs por último leva também essas linhas.
--
-- A comparação do contrato ignora caixa e espaços (`CICOPAL` = ` cicopal `),
-- porque a carga grava o `tenantid` em maiúsculas e há linhas legadas com
-- espaços. A coluna legada `asset_logs.tenant_id` é lida por JSON, para o
-- script não falhar em bases onde ela não exista.
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
  v_resta      bigint := 0;
  v_triggers   text;
begin
  if v_tenant = '' then
    raise exception 'Contrato vazio: defina o tenantid na primeira linha do script (set_config).';
  end if;

  -- Triggers em `public.assets`: é por aqui que o reset pode reescrever logs.
  select coalesce(string_agg(t.tgname, ', '), 'nenhum') into v_triggers
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'assets' and not t.tgisinternal;

  -- Fotografia ANTES.
  select count(*) into v_ativos from public.assets a
   where upper(btrim(coalesce(a.tenantid, ''))) = v_tenant;
  select count(*) into v_campanhas from public.campaigns c
   where upper(btrim(coalesce(c.tenantid, ''))) = v_tenant;
  select count(*) into v_laudos from public.campaign_snapshots s
   where upper(btrim(coalesce(s.tenantid, ''))) = v_tenant;
  select count(*) into v_logs from public.asset_logs l
   where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) = v_tenant;

  raise notice 'ANTES  contrato=%  ativos=%  campanhas=%  laudos=%  logs=%',
    v_tenant, v_ativos, v_campanhas, v_laudos, v_logs;
  raise notice 'triggers em public.assets: %', v_triggers;

  delete from public.campaign_snapshots s
   where upper(btrim(coalesce(s.tenantid, ''))) = v_tenant;
  get diagnostics v_laudos = row_count;

  delete from public.campaigns c
   where upper(btrim(coalesce(c.tenantid, ''))) = v_tenant;
  get diagnostics v_campanhas = row_count;

  -- Antes dos logs de propósito: o trigger de auditoria escreve aqui as linhas
  -- do próprio DELETE e o passo seguinte leva-as junto.
  delete from public.assets a
   where upper(btrim(coalesce(a.tenantid, ''))) = v_tenant;
  get diagnostics v_ativos = row_count;

  delete from public.asset_logs l
   where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) = v_tenant;
  get diagnostics v_logs = row_count;

  raise notice 'DEPOIS contrato=%  apagados: ativos=%  campanhas=%  laudos=%  logs=%',
    v_tenant, v_ativos, v_campanhas, v_laudos, v_logs;

  -- Conferência dentro da transação: ativos/campanhas/laudos a zero é requisito.
  select (select count(*) from public.assets a
           where upper(btrim(coalesce(a.tenantid, ''))) = v_tenant)
       + (select count(*) from public.campaigns c
           where upper(btrim(coalesce(c.tenantid, ''))) = v_tenant)
       + (select count(*) from public.campaign_snapshots s
           where upper(btrim(coalesce(s.tenantid, ''))) = v_tenant)
    into v_resta;

  if v_resta > 0 then
    raise exception 'Reset incompleto: restam % linha(s) de ativos/campanhas/laudos do contrato %. Nada foi apagado (rollback).',
      v_resta, v_tenant;
  end if;

  -- Logs podem sobrar por RLS (DELETE sem policy apaga 0 linhas, sem erro) ou
  -- por algum trigger que escreva no fim do statement.
  select count(*) into v_resta from public.asset_logs l
   where upper(btrim(coalesce(to_jsonb(l)->>'tenantid', to_jsonb(l)->>'tenant_id', ''))) = v_tenant;

  if v_resta > 0 then
    raise warning 'LOGS RESTANTES: % linha(s) em asset_logs do contrato %. Causas prováveis: RLS a bloquear o DELETE (SELECT passa, DELETE não) ou trigger a escrever depois do statement. Diagnóstico: %',
      v_resta, v_tenant,
      (select format('rls=%s force=%s dono=%s', c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner))
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'asset_logs');
    raise warning 'Se for RLS: rode como dono da tabela (SQL Editor) e execute  alter table public.asset_logs disable row level security;  antes dos DELETE, reativando no fim da mesma transação.';
  end if;
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
