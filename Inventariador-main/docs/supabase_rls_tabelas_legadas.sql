-- ============================================================================
-- GBR KARDEK — RLS das tabelas legadas / fora do bootstrap
-- ----------------------------------------------------------------------------
-- Fecha o que sobra fora dos scripts anteriores (supabase_privacidade_storage,
-- supabase_rls_assets_permissoes, supabase_rls_tabelas_restantes). Duas famílias:
--
--   A. LEGADO, que o app NÃO consulta. Só aparecem na lista de validação do
--      interceptor do Supabase (`infrastructureTables`) e/ou na normalização de
--      nomes de coluna:
--        tenants, filial, camposAlterados  → sem política (RLS nega tudo)
--        unit_gps_data                     → o interceptor reescreve
--                                            `from('unit_gps_data')` para
--                                            `inventory_config`; se a tabela
--                                            existir e tiver `tenantid`, fica
--                                            com a mesma política por contrato
--                                            (builds antigos continuam a ler a
--                                            sua), senão fica sem política.
--
--   B. CONTROLO PATRIMONIAL, que o app consulta (`assetControlService`):
--        chart_of_accounts, asset_groups, ncm_classifiers, asset_movements,
--        asset_depreciation_history → `tenantid` + leitura/escrita no contrato
--        log_inventario_termico      → telemetria sem contrato: só INSERT para
--                                      `authenticated`, sem SELECT (ninguém lê
--                                      pelo PostgREST; painéis usam service_role)
--
-- Além disso, retira a `anon` o privilégio em TODAS as tabelas e sequências de
-- `public` (inclui views, que são "tables" para GRANT). Isto é a rede de
-- segurança: mesmo que apareça uma tabela que nenhum script conhece, o anon
-- deixa de a alcançar.
--
-- TUDO É CONDICIONAL (`to_regclass`): a base pode não ter estas tabelas e o
-- script não pode falhar por isso. É idempotente e pode correr mais de uma vez.
--
-- PRÉ-REQUISITO: docs/supabase_rls_tabelas_restantes.sql (cria
-- `public.tenant_visible(text)`). O PASSO 0 recusa correr sem ela.
--
-- COMO USAR: colar o ficheiro INTEIRO no SQL Editor e executar. Os blocos
-- `DO $$ … $$` são uma unidade: não executar linhas isoladas de dentro deles.
--
-- O QUE ESTE FICHEIRO NÃO FAZ: alterar VIEWS. Uma view sem
-- `security_invoker = true` corre com os privilégios do dono e pode atravessar
-- o RLS das tabelas por baixo. O bloco AUDITORIA no fim lista as views e gera o
-- `ALTER VIEW ... SET (security_invoker = true);` de cada uma — revê e corre à
-- parte o que fizer sentido.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PASSO 0 — pré-requisito: a regra de contrato dos scripts anteriores
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.tenant_visible(text)') IS NULL THEN
    RAISE EXCEPTION 'Função em falta: corra primeiro docs/supabase_rls_tabelas_restantes.sql (tenant_visible).';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASSO 1 — `anon` sem privilégio em nada de `public`
--   Inclui tabelas, views e matviews (GRANT trata-os como tabelas) e
--   sequências. `email_by_username` e `unit_names` são funções e não são
--   afectadas — o login por username continua a funcionar.
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ----------------------------------------------------------------------------
-- PASSO 2 — legado sem uso pelo app: RLS ligado, sem política (nega tudo)
--   Se algum dia precisares de leitura autenticada, acrescenta uma política
--   explícita — o silêncio do RLS não se abre sozinho.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.tenants;
    DROP POLICY IF EXISTS p_tenant_all ON public.tenants;
    DROP POLICY IF EXISTS p_authenticated_select ON public.tenants;
    REVOKE ALL ON public.tenants FROM anon;
    RAISE NOTICE 'tenants: RLS ligado, sem política (fechada).';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.filial') IS NOT NULL THEN
    ALTER TABLE public.filial ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.filial;
    DROP POLICY IF EXISTS p_tenant_all ON public.filial;
    DROP POLICY IF EXISTS p_authenticated_select ON public.filial;
    REVOKE ALL ON public.filial FROM anon;
    RAISE NOTICE 'filial: RLS ligado, sem política (fechada).';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."camposAlterados"') IS NOT NULL THEN
    ALTER TABLE public."camposAlterados" ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public."camposAlterados";
    DROP POLICY IF EXISTS p_tenant_all ON public."camposAlterados";
    DROP POLICY IF EXISTS p_authenticated_select ON public."camposAlterados";
    REVOKE ALL ON public."camposAlterados" FROM anon;
    RAISE NOTICE 'camposAlterados: RLS ligado, sem política (fechada).';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASSO 3 — unit_gps_data: legado do GPS, reescrito para inventory_config
--   Com `tenantid`, mantém a mesma política por contrato (um APK antigo que
--   ainda a consulte não perde a sua filial nem ganha a dos outros).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.unit_gps_data') IS NOT NULL THEN
    ALTER TABLE public.unit_gps_data ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.unit_gps_data;
    DROP POLICY IF EXISTS p_tenant_all ON public.unit_gps_data;
    DROP POLICY IF EXISTS p_authenticated_select ON public.unit_gps_data;
    REVOKE ALL ON public.unit_gps_data FROM anon;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'unit_gps_data' AND column_name = 'tenantid'
    ) THEN
      CREATE POLICY p_tenant_all ON public.unit_gps_data
        FOR ALL TO authenticated
        USING (public.tenant_visible(tenantid))
        WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'unit_gps_data: política por contrato.';
    ELSE
      RAISE NOTICE 'unit_gps_data: sem coluna tenantid — RLS ligado, sem política (fechada).';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASSO 4 — controlo patrimonial: política por contrato
--   Mesmo contrato de `assets`: `tenantid` obrigatório para o app; MASTER
--   atravessa. Sem a coluna, RLS ligado e sem política (nega) — melhor negar
--   do que deixar aberto enquanto se investiga.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.chart_of_accounts') IS NOT NULL THEN
    ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.chart_of_accounts;
    DROP POLICY IF EXISTS p_tenant_all ON public.chart_of_accounts;
    REVOKE ALL ON public.chart_of_accounts FROM anon;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chart_of_accounts' AND column_name = 'tenantid') THEN
      CREATE POLICY p_tenant_all ON public.chart_of_accounts FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'chart_of_accounts: política por contrato.';
    ELSE
      RAISE NOTICE 'chart_of_accounts: sem tenantid — fechada.';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asset_groups') IS NOT NULL THEN
    ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.asset_groups;
    DROP POLICY IF EXISTS p_tenant_all ON public.asset_groups;
    REVOKE ALL ON public.asset_groups FROM anon;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asset_groups' AND column_name = 'tenantid') THEN
      CREATE POLICY p_tenant_all ON public.asset_groups FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'asset_groups: política por contrato.';
    ELSE
      RAISE NOTICE 'asset_groups: sem tenantid — fechada.';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ncm_classifiers') IS NOT NULL THEN
    ALTER TABLE public.ncm_classifiers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.ncm_classifiers;
    DROP POLICY IF EXISTS p_tenant_all ON public.ncm_classifiers;
    REVOKE ALL ON public.ncm_classifiers FROM anon;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ncm_classifiers' AND column_name = 'tenantid') THEN
      CREATE POLICY p_tenant_all ON public.ncm_classifiers FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'ncm_classifiers: política por contrato.';
    ELSE
      RAISE NOTICE 'ncm_classifiers: sem tenantid — fechada.';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asset_movements') IS NOT NULL THEN
    ALTER TABLE public.asset_movements ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.asset_movements;
    DROP POLICY IF EXISTS p_tenant_all ON public.asset_movements;
    REVOKE ALL ON public.asset_movements FROM anon;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asset_movements' AND column_name = 'tenantid') THEN
      CREATE POLICY p_tenant_all ON public.asset_movements FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'asset_movements: política por contrato.';
    ELSE
      RAISE NOTICE 'asset_movements: sem tenantid — fechada.';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.asset_depreciation_history') IS NOT NULL THEN
    ALTER TABLE public.asset_depreciation_history ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.asset_depreciation_history;
    DROP POLICY IF EXISTS p_tenant_all ON public.asset_depreciation_history;
    REVOKE ALL ON public.asset_depreciation_history FROM anon;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'asset_depreciation_history' AND column_name = 'tenantid') THEN
      CREATE POLICY p_tenant_all ON public.asset_depreciation_history FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
      RAISE NOTICE 'asset_depreciation_history: política por contrato.';
    ELSE
      RAISE NOTICE 'asset_depreciation_history: sem tenantid — fechada.';
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- PASSO 5 — log_inventario_termico: telemetria sem contrato
--   `telemetryService` só faz INSERT (utilizador, etiqueta, temperatura,
--   bateria, lanterna, hora). Sem SELECT: ninguém lê a telemetria pelo
--   PostgREST; painéis/exportações usam service_role (que ignora RLS).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.log_inventario_termico') IS NOT NULL THEN
    ALTER TABLE public.log_inventario_termico ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS p_all ON public.log_inventario_termico;
    DROP POLICY IF EXISTS p_tenant_insert ON public.log_inventario_termico;
    DROP POLICY IF EXISTS p_authenticated_insert ON public.log_inventario_termico;
    DROP POLICY IF EXISTS p_authenticated_select ON public.log_inventario_termico;
    REVOKE ALL ON public.log_inventario_termico FROM anon;
    CREATE POLICY p_authenticated_insert ON public.log_inventario_termico
      FOR INSERT TO authenticated
      WITH CHECK (true);
    RAISE NOTICE 'log_inventario_termico: só INSERT autenticado.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- AUDITORIA (só leitura — correr antes e depois de aplicar)
-- ----------------------------------------------------------------------------
-- A) Inventário de tudo o que existe em public, com RLS e políticas:
--   select c.relname as objeto, case c.relkind when 'r' then 'tabela' when 'p' then 'particionada' when 'v' then 'view' when 'm' then 'matview' end as tipo, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forcada, pg_get_userbyid(c.relowner) as dono, coalesce(array_to_string(c.reloptions, ','), '') as opcoes, coalesce((select string_agg(p.policyname || ' [' || p.cmd || '] ' || array_to_string(p.roles, ','), ' | ') from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname), '(sem políticas)') as politicas from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1;
--
-- B) Privilégios de `anon`/`PUBLIC` em tabelas e views (deve ser 0 linhas):
--   select table_name, privilege_type, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC') order by 1, 2;
--   select table_name, column_name, privilege_type, grantee from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'PUBLIC') order by 1, 2;
--
-- C) Privilégios de `anon`/`PUBLIC` em sequências (deve ser 0 linhas):
--   select c.relname as sequencia, a.privilege_type, coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') as grantee from pg_class c, aclexplode(c.relacl) a where c.relkind = 'S' and c.relnamespace = 'public'::regnamespace and coalesce(pg_get_userbyid(a.grantee), 'PUBLIC') in ('anon', 'PUBLIC');
--
-- D) Colunas das tabelas por rever (para confirmar `tenantid` e o formato):
--   select table_name, string_agg(column_name, ', ' order by ordinal_position) as colunas from information_schema.columns where table_schema = 'public' and table_name in ('tenants', 'filial', 'camposAlterados', 'unit_gps_data', 'chart_of_accounts', 'asset_groups', 'ncm_classifiers', 'asset_movements', 'asset_depreciation_history', 'log_inventario_termico') group by 1 order by 1;
--
-- E) Views e o comando que falta em cada uma (se a coluna `corrigir` vier com
--    ALTER VIEW, a view corre como dono e atravessa o RLS — revê e aplica):
--   select c.relname as view, pg_get_userbyid(c.relowner) as dono, coalesce(array_to_string(c.reloptions, ','), '(sem opções)') as opcoes, case when coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%' then 'ok (security_invoker)' else format('ALTER VIEW public.%I SET (security_invoker = true);', c.relname) end as corrigir from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v' order by 1;
--
-- F) Matviews (não aceitam security_invoker; lêem-se com GRANT — confirma que
--    `authenticated` não tem acesso a uma matview com dados de todos):
--   select c.relname as matview, coalesce(array_to_string(c.relacl, ' | '), '(sem ACL)') as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'm' order by 1;
--
-- G) Funções executáveis por `anon` (esperado: email_by_username, unit_names):
--   select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1;
-- ============================================================================
