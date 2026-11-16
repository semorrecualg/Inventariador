-- ============================================================================
-- GBR KARDEK · Inventariador — RESET DA BASE DE TESTE (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- ATENÇÃO: ESTE SCRIPT APAGA TABELAS. Use APENAS no projeto de TESTE.
--
-- O que faz:
--   1. Confirma que quem corre sabe o que está a fazer (guarda explícita).
--   2. DROP TABLE de todas as tabelas de inventário/auditoria (as que não
--      existirem são ignoradas, sem erro).
--   3. Deixa a recriação para o schema canónico do repositório:
--      `docs/supabase_bootstrap.sql` — rodar depois, no mesmo editor.
--      Assim as tabelas, colunas, PK composta (tenantid, id), índice único
--      (tenantid, primarykey), índices de leitura, defaults e políticas RLS
--      voltam exactamente como o app espera, sem cirurgia manual de índices.
--   4. Traz as validações pós-carga (volume por unidade, chaves fora do
--      formato do ERP e duplicados pela identidade do contrato).
--
-- O que NÃO faz:
--   - Não toca em `auth.users` (logins) nem em `user_permissions` por omissão
--     (ver § 1-B; apagar `user_permissions` tranca todos os utilizadores).
--   - Não carrega a planilha: a carga é feita no app, depois de o dispositivo
--     ser limpo (Gestor de Base → «Preparar Nova Carga»).
--
-- ============================================================================
-- USO
-- ----------------------------------------------------------------------------
-- 1) SQL Editor → New query: cole § 0 + § 1 (autorização e drops).
-- 2) Descomente e rode primeiro a autorização, isolada:
--        select set_config('gbr.reset_test', 'SIM-TENHO-CERTEZA', false);
--    Sem ela o script aborta com uma mensagem — protecção contra correr isto
--    no projeto errado.
-- 3) No mesmo editor, rode agora `docs/supabase_bootstrap.sql` (recria tudo).
-- 4) No dispositivo: Gestor de Base → «Preparar Nova Carga» (limpa a base local
--    e as flags `app_migrate_asset_keys_erp_v1` /
--    `app_repair_fiscal_account_resync_v1`).
-- 5) Carga de Dados.
-- 6) Corra o bloco § 3 (VALIDAÇÕES PÓS-CARGA).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. AUTORIZAÇÃO (passo separado, descomente e rode antes)
-- ----------------------------------------------------------------------------
-- select set_config('gbr.reset_test', 'SIM-TENHO-CERTEZA', false);

begin;

do $$
begin
  if current_setting('gbr.reset_test', true) is distinct from 'SIM-TENHO-CERTEZA' then
    raise exception
      'Reset bloqueado: falta autorização. Rode primeiro, nesta sessão: select set_config(''gbr.reset_test'', ''SIM-TENHO-CERTEZA'', false);';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. DROPAR AS TABELAS DE INVENTÁRIO / AUDITORIA
--    `cascade` remove FKs dependentes entre elas. Tabelas inexistentes são
--    ignoradas. `user_permissions` fica de fora por omissão (§ 1-B).
-- ----------------------------------------------------------------------------
do $$
declare
  alvo text;
begin
  foreach alvo in array array[
    'assets',
    'asset_logs',
    'asset-photos',
    'asset_movements',
    'asset_depreciation_history',
    'asset_groups',
    'chart_of_accounts',
    'ncm_classifiers',
    'locations',
    'inventory_config',
    'unit_configs',
    'campaigns',
    'campaign_snapshots',
    'log_inventario_termico',
    'field_events',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', alvo)) is not null then
      execute format('drop table public.%I cascade', alvo);
      raise notice 'dropada: public.%', alvo;
    else
      raise notice 'ignorada (não existe): public.%', alvo;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1-B. UTILIZADORES (OPCIONAL — descomente só se quiser recriar os perfis)
--      Apagar `user_permissions` remove os perfis (ADMIN/MASTER/…). Os logins
--      em `auth.users` não são tocados nem devem ser: sem eles ninguém entra.
-- ----------------------------------------------------------------------------
-- drop table public.user_permissions cascade;

commit;

-- ----------------------------------------------------------------------------
-- 2. RECRIAR O SCHEMA
--    Rode agora, neste mesmo editor, o conteúdo de `docs/supabase_bootstrap.sql`.
--    É idempotente e repõe tabelas, colunas, PK (tenantid, id), índice único
--    (tenantid, primarykey), índices de leitura, defaults e políticas RLS.
--
--    Confirmação rápida de que a recriação passou:
-- ----------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- ----------------------------------------------------------------------------
-- 3. VALIDAÇÕES PÓS-CARGA
--    Rode depois da Carga de Dados. § 3.2 e § 3.3 devem devolver 0 linhas.
-- ----------------------------------------------------------------------------
-- 3.1 Volume por contrato e unidade — confira contra a planilha
select tenantid,
       substring(coalesce(filial, '') from '^[0-9]+') as filial_codigo,
       count(*) as linhas
from public.assets
group by 1, 2
order by 1, 2;

-- 3.2 Chaves fora do formato do ERP (`código da filial + registro + subreg`)
--     Esperado: 0 linhas. Se aparecerem, a carga entrou por caminho antigo.
select tenantid, primarykey, filial, registro, subreg
from public.assets
where primarykey is null
   or primarykey = ''
   or primarykey !~ '^[0-9A-Z-]+$'
order by tenantid, primarykey
limit 50;

-- 3.3 Duplicados pela identidade do ERP (devem ser 0)
select tenantid,
       substring(coalesce(filial, '') from '^[0-9]+') as filial_codigo,
       registro, subreg, count(*) as linhas
from public.assets
where coalesce(registro, '') <> '' or coalesce(subreg, '') <> ''
group by 1, 2, 3, 4
having count(*) > 1
order by linhas desc
limit 50;

-- 3.4 Linhas sem identidade de ERP (sem registro nem subreg): ficam com chave
--     derivada do conteúdo. Só inspeccione — não são erro.
select tenantid, count(*) as sem_identidade
from public.assets
where coalesce(registro, '') = '' and coalesce(subreg, '') = ''
group by 1
order by 2 desc;

-- 3.5 Índices que o bootstrap deixou em `assets`
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'assets'
order by indexname;
