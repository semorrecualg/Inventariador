-- ============================================================================
-- GBR KARDEK — RLS das tabelas legadas / fora do bootstrap
-- ----------------------------------------------------------------------------
-- Fecha o que sobra fora dos scripts anteriores. Duas famílias:
--
--   A. LEGADO, que o app NÃO consulta (só aparecem na lista de validação do
--      interceptor e na normalização de nomes de coluna):
--        tenants, filial, camposAlterados  → fechar (RLS sem política)
--        unit_gps_data                     → o interceptor reescreve
--                                            from('unit_gps_data') para
--                                            inventory_config; se existir e
--                                            tiver tenantid, fica por contrato
--
--   B. CONTROLO PATRIMONIAL, consultado por `assetControlService`:
--        chart_of_accounts, asset_groups, ncm_classifiers, asset_movements,
--        asset_depreciation_history → por contrato (tenantid)
--        log_inventario_termico      → telemetria sem contrato: só INSERT
--                                      autenticado, sem SELECT
--
-- PORQUE NÃO HÁ BLOCOS `DO`: um bloco `DO $$ BEGIN … END $$;` só corre inteiro.
-- Se o editor enviar um fragmento (já aconteceu: 42601 em `IF`), falha. Aqui
-- cada instrução é autónoma e o DDL condicional é GERADO por uma consulta, para
-- ser revisto antes de executado.
--
-- COMO USAR (três passos, por esta ordem)
--
--   PASSO 1 — correr já. Fecha o `anon` em tudo o que existe em `public`
--             (tabelas, views, matviews e sequências). Não depende de nenhuma
--             tabela em particular e não pode falhar por tabela em falta.
--
--   PASSO 2 — correr a consulta GERADORA. É só leitura: devolve o DDL exacto
--             para as tabelas que a tua base tem (e, nas patrimoniais, só cria
--             política se existir a coluna `tenantid`). Se devolver o texto
--             "-- nada a fazer", nenhuma dessas tabelas existe.
--
--   PASSO 3 — copiar o resultado do PASSO 2 e executar. É DDL normal:
--             ALTER TABLE … / DROP POLICY … / REVOKE … / CREATE POLICY …
--
--   Pré-requisito do PASSO 3: `public.tenant_visible(text)`, criada em
--   docs/supabase_rls_tabelas_restantes.sql. Se não existir, o PASSO 2 avisa.
--
-- Idempotente: o PASSO 2 pode ser gerado e executado de novo.
--
-- VIEWS: este ficheiro não altera views. Uma view sem `security_invoker = true`
-- corre com os privilégios do dono e atravessa o RLS das tabelas por baixo. O
-- bloco AUDITORIA no fim lista as views e gera o comando de cada uma.
-- ============================================================================

-- ============================================================================
-- PASSO 1 — `anon` sem privilégio em nada de `public`
--   Inclui tabelas, views e matviews (GRANT trata-os como tabelas) e
--   sequências. `email_by_username` e `unit_names` são funções: não são
--   afectadas, o login por username continua a funcionar.
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ============================================================================
-- PASSO 2 — GERADOR (só leitura): o DDL que falta, para as tabelas existentes
--   `modo`:
--     fechar → RLS ligado, políticas antigas removidas, nenhuma criada (nega)
--     tenant → se tiver `tenantid`: p_tenant_all por contrato
--     insert → p_authenticated_insert (INSERT autenticado, sem SELECT)
--   A ordem de saída é: ENABLE RLS → DROP POLICY → REVOKE → CREATE POLICY.
-- ============================================================================
WITH alvo(tabela, modo) AS (
  VALUES
    ('tenants', 'fechar'),
    ('filial', 'fechar'),
    ('"camposAlterados"', 'fechar'),
    ('unit_gps_data', 'tenant'),
    ('chart_of_accounts', 'tenant'),
    ('asset_groups', 'tenant'),
    ('ncm_classifiers', 'tenant'),
    ('asset_movements', 'tenant'),
    ('asset_depreciation_history', 'tenant'),
    ('log_inventario_termico', 'insert')
),
existentes AS (
  SELECT a.tabela,
         a.modo,
         to_regclass('public.' || a.tabela) IS NOT NULL AS existe,
         EXISTS (
           SELECT 1
             FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = replace(a.tabela, '"', '')
              AND c.column_name = 'tenantid'
         ) AS tem_tenantid
    FROM alvo a
),
passos AS (
  SELECT 1 AS ordem,
         format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY;', e.tabela) AS sql
    FROM existentes e
   WHERE e.existe
  UNION ALL
  SELECT 2,
         format('DROP POLICY IF EXISTS %I ON public.%s;', p.policyname, e.tabela)
    FROM existentes e
    JOIN pg_policies p
      ON p.schemaname = 'public'
     AND p.tablename = replace(e.tabela, '"', '')
   WHERE e.existe
  UNION ALL
  -- Drops explícitos dos nomes que este gerador cria: o texto gerado fica
  -- idempotente mesmo quando reaplicado sem ser regenerado.
  SELECT 2,
         format('DROP POLICY IF EXISTS p_tenant_all ON public.%s;', e.tabela)
    FROM existentes e
   WHERE e.existe
     AND e.modo = 'tenant'
     AND e.tem_tenantid
  UNION ALL
  SELECT 2,
         format('DROP POLICY IF EXISTS p_authenticated_insert ON public.%s;', e.tabela)
    FROM existentes e
   WHERE e.existe
     AND e.modo = 'insert'
  UNION ALL
  SELECT 3,
         format('REVOKE ALL ON public.%s FROM anon;', e.tabela)
    FROM existentes e
   WHERE e.existe
  UNION ALL
  SELECT 4,
         CASE
           WHEN e.modo = 'tenant' AND e.tem_tenantid THEN
             format('CREATE POLICY p_tenant_all ON public.%s FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));', e.tabela)
           WHEN e.modo = 'insert' THEN
             format('CREATE POLICY p_authenticated_insert ON public.%s FOR INSERT TO authenticated WITH CHECK (true);', e.tabela)
         END
    FROM existentes e
   WHERE e.existe
     AND e.modo IN ('tenant', 'insert')
)
SELECT coalesce(string_agg(p.sql, E'\n' ORDER BY p.ordem, p.sql),
                '-- nada a fazer: nenhuma destas tabelas existe na base') AS script
  FROM passos p
 WHERE p.sql IS NOT NULL;

-- ============================================================================
-- PASSO 3 — executar o resultado do PASSO 2
--   Exemplo do que sai quando as tabelas existem com `tenantid`:
--
--     ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
--     DROP POLICY IF EXISTS p_all ON public.tenants;
--     REVOKE ALL ON public.tenants FROM anon;
--     ...
--     CREATE POLICY p_tenant_all ON public.unit_gps_data FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
--     CREATE POLICY p_authenticated_insert ON public.log_inventario_termico FOR INSERT TO authenticated WITH CHECK (true);
--
--   Copia o texto e corre-o como uma consulta nova. Se a consulta devolver
--   "-- nada a fazer", não há nada a aplicar.
-- ============================================================================

-- ============================================================================
-- AUDITORIA (só leitura)
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
-- D) Colunas das tabelas por rever (confirma `tenantid` e o formato):
--   select table_name, string_agg(column_name, ', ' order by ordinal_position) as colunas from information_schema.columns where table_schema = 'public' and table_name in ('tenants', 'filial', 'camposAlterados', 'unit_gps_data', 'chart_of_accounts', 'asset_groups', 'ncm_classifiers', 'asset_movements', 'asset_depreciation_history', 'log_inventario_termico') group by 1 order by 1;
--
-- E) Views e o comando que falta em cada uma (se vier um ALTER VIEW, a view
--    corre como dono e atravessa o RLS — revê e aplica):
--   select c.relname as view, pg_get_userbyid(c.relowner) as dono, coalesce(array_to_string(c.reloptions, ','), '(sem opções)') as opcoes, case when coalesce(array_to_string(c.reloptions, ''), '') like '%security_invoker=true%' then 'ok (security_invoker)' else format('ALTER VIEW public.%I SET (security_invoker = true);', c.relname) end as corrigir from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'v' order by 1;
--
-- F) Matviews (não aceitam security_invoker; confirma que `authenticated` não
--    tem acesso a uma matview com dados de todos):
--   select c.relname as matview, coalesce(array_to_string(c.relacl, ' | '), '(sem ACL)') as acl from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'm' order by 1;
--
-- G) Funções executáveis por `anon` (esperado: email_by_username, unit_names):
--   select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1;
--
-- H) Confirmação final do PASSO 3 (as tabelas geradas devem ter política
--    `p_tenant_all`/`p_authenticated_insert` e nenhuma com `anon`):
--   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename in ('tenants', 'filial', 'camposAlterados', 'unit_gps_data', 'chart_of_accounts', 'asset_groups', 'ncm_classifiers', 'asset_movements', 'asset_depreciation_history', 'log_inventario_termico') order by 1, 2;
-- ============================================================================
