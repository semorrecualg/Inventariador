-- ============================================================================
-- GBR KARDEK · DIAGNÓSTICO DO 42501 «permission denied for table dics»
-- ----------------------------------------------------------------------------
-- CONTEXTO: o app nunca escreve em `dics` (0 referências em src/, scripts/ e
-- docs/*.sql). O erro aparece no upsert de ativos, o que aponta para um objeto
-- da nuvem criado fora das migrações — trigger, função, view ou política — que
-- corre com o papel do pedido e falha naquela tabela. Há precedente no
-- repositório: um trigger em `asset_logs` (coluna `tenant_id`) abortava o
-- espelhamento de `assets` e a mensagem citava a outra tabela.
--
-- COMO USAR: Supabase Dashboard → SQL Editor → cole o ficheiro inteiro → Run.
-- Cada consulta é independente; as que não encontrarem objeto devolvem 0 linhas
-- (isso também é resposta).
--
-- SÓ LEITURA: este ficheiro não tem INSERT/UPDATE/DELETE/DDL. Não «prepare»
-- nada à mão; o estado observado tem de ser o real.
--
-- O QUE DEVOLVER: o resultado de cada bloco (ou «0 linhas»), o `current_user`
-- do bloco 0 e, sobretudo, os blocos 3d/3e — são eles que dizem se o 42501 vem
-- do GRANT em falta ou de um objeto escondido.
-- ============================================================================

-- 0) Com que papel esta sessão corre (o SQL Editor usa `postgres`; o app usa
--    `anon` ou `authenticated`). Sem isto, os GRANTs lidos abaixo não se sabem
--    aplicar a quem falha.
select current_user as papel_da_sessao, session_user as papel_de_login;

-- 1) A tabela existe? Em que schema, de quem, com RLS?
--    (Se não existir, o 42501 vem de um objeto que já não devia existir ou de
--    um schema fora de `public` — ver bloco 9.)
select n.nspname as schema,
       c.relname as tabela,
       c.relkind as tipo,
       pg_get_userbyid(c.relowner) as dono,
       c.relrowsecurity as rls_ligado,
       c.relforcerowsecurity as rls_forcado
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relname = 'dics';

-- 2) Colunas e tipos (para reconhecer a tabela pelo conteúdo)
select table_schema, table_name, ordinal_position, column_name,
       data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'dics'
 order by table_schema, ordinal_position;

-- 3) Privilégios por papel — a resposta directa ao 42501.
--    ATENÇÃO: `role_table_grants` só mostra os privilégios em que o grantor ou o
--    grantee é um papel ACTIVO para a sessão (PostgreSQL §35.37). O SQL Editor
--    corre como `postgres`; um GRANT dado por `supabase_admin` fica invisível
--    ali. Por isso o bloco lê também o ACL cru e o expande com `aclexplode`,
--    que não tem esse filtro de visibilidade.

-- 3a) Visão filtrada (responde quando o grantee é um papel visível)
select table_schema, table_name, grantee, privilege_type, is_grantable
  from information_schema.role_table_grants
 where table_name = 'dics'
 order by table_schema, grantee, privilege_type;

-- 3b) ACL cru, tal como está gravado no catálogo. `NULL` significa «sem ACL
--     próprio» = só o dono tem privilégios (o default do Postgres).
select n.nspname as schema,
       c.relname as tabela,
       pg_get_userbyid(c.relowner) as dono,
       c.relacl::text as acl_cru
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relname = 'dics';

-- 3c) ACL expandido por grantor/grantee. Mostra o grantor (que o 3a não mostra
--     e que costuma ser a peça em falta) e usa o ACL por omissão quando
--     `relacl` é NULL, para não devolver 0 linhas por engano.
select n.nspname as schema,
       c.relname as tabela,
       pg_get_userbyid(x.grantor) as grantor,
       case when x.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(x.grantee) end as grantee,
       x.privilege_type,
       x.is_grantable
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as x
 where c.relname = 'dics'
 order by 3, 4, 5;

-- 3d) Privilégios EFECTIVOS de `anon` e `authenticated` na tabela. O 3a lê o
--     catálogo com o filtro de visibilidade do SQL Editor; `has_table_privilege`
--     responde pelo caminho do servidor, já com a herança de papéis resolvida,
--     e é a mesma verificação que o Postgres faz ao recusar o pedido. `false`
--     em INSERT/UPDATE para o papel do app = GRANT em falta; `true` nos dois =
--     o 42501 vem de um objeto que corre por baixo (blocos 4 a 8).
select p.papel,
       has_table_privilege(p.papel, c.oid, 'SELECT')     as pode_select,
       has_table_privilege(p.papel, c.oid, 'INSERT')     as pode_insert,
       has_table_privilege(p.papel, c.oid, 'UPDATE')     as pode_update,
       has_table_privilege(p.papel, c.oid, 'DELETE')     as pode_delete,
       has_table_privilege(p.papel, c.oid, 'TRUNCATE')   as pode_truncate,
       has_table_privilege(p.papel, c.oid, 'REFERENCES') as pode_references,
       has_table_privilege(p.papel, c.oid, 'TRIGGER')    as pode_trigger
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as p(papel)
 where c.relname = 'dics'
   and n.nspname not in ('pg_catalog', 'information_schema')
 order by 1;

-- 3e) Com que papel corre o pedido do app. O PostgREST liga-se como
--     `authenticator` e faz SET ROLE para `anon` (pedido sem JWT) ou
--     `authenticated` (pedido com sessão); é por isso que o `current_user` do
--     bloco 0 (`postgres`) não descreve quem falha. Aqui vêem-se os papéis
--     envolvidos, o que o `authenticator` pode assumir e as ligações do
--     PostgREST abertas neste momento — `usename` é o papel de login real
--     (`authenticator`), não o papel assumido: esse lê-se no 3d.
select r.rolname as papel,
       r.rolcanlogin as pode_entrar,
       r.rolsuper as superuser,
       r.rolbypassrls as ignora_rls,
       coalesce((select string_agg(m.rolname, ', ' order by m.rolname)
                   from pg_auth_members am
                   join pg_roles m on m.oid = am.roleid
                  where am.member = r.oid), '(nenhum)') as pode_assumir
  from pg_roles r
 where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
 order by 1;

select pid,
       usename as papel_de_login,
       application_name,
       state,
       backend_start,
       left(query, 160) as consulta
  from pg_stat_activity
 where datname = current_database()
   and (application_name ilike '%postgrest%'
        or usename in ('authenticator', 'supabase_admin'))
 order by backend_start;

-- 4) Políticas de RLS (se houver). Uma política que chama função é candidata.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where tablename = 'dics';

-- 5) Triggers — em QUALQUER tabela — cuja definição menciona dics.
--    É o caso mais provável: o upsert de `assets` dispara o trigger e o erro
--    cita a tabela em que o trigger escreveu.
select n.nspname || '.' || c.relname as tabela_do_trigger,
       t.tgname as trigger,
       t.tgenabled as estado,
       pg_get_triggerdef(t.oid) as definicao
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal
   and pg_get_triggerdef(t.oid) ilike '%dics%'
 order by 1, 2;

-- 6) Funções cujo corpo menciona dics (inclui SECURITY DEFINER, que corre com
--    o dono e não com o papel do pedido)
select n.nspname as schema,
       p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as dono
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where p.prosrc ilike '%dics%'
 order by 1, 2;

-- 7) Views e views materializadas que leem dics
select schemaname, viewname, definition
  from pg_views
 where definition ilike '%dics%'
union all
select schemaname, matviewname, definition
  from pg_matviews
 where definition ilike '%dics%';

-- 8) Regras (rara, mas escreve por baixo de um SELECT/INSERT)
select schemaname, tablename, rulename, definition
  from pg_rules
 where definition ilike '%dics%';

-- 9) Tabelas parecidas — confirma se o nome é `dics` mesmo ou uma variante
select n.nspname as schema, c.relname as tabela, c.relkind as tipo
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'p', 'v', 'm')
   and c.relname ilike 'dic%'
 order by 1, 2;

-- 10) Esta tabela já recebeu escritas? (contadores acumulados do Postgres)
--     n_tup_ins/upd/del > 0 = alguém escreve; tudo 0 com o 42501 a acontecer =
--     a escrita é recusada antes de contar.
select schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup
  from pg_stat_user_tables
 where relname = 'dics';

-- 11) Dependências registadas (o que o catálogo diz depender de dics)
select d.classid::regclass as tipo_de_objeto,
       d.objid,
       d.deptype as tipo_de_dependencia
  from pg_depend d
  join pg_class c on c.oid = d.refobjid
 where c.relname = 'dics'
   and d.refclassid = 'pg_class'::regclass
 order by 1, 2
 limit 100;

-- ============================================================================
-- FIM. Nenhuma instrução escreve. Se o bloco 1 vier vazio e o 9 mostrar uma
-- variante (ex.: `dics_ativos`), o erro está num objeto criado por fora e o
-- nome citado na mensagem é o dessa variante. Se o 3d vier com `pode_insert`
-- ou `pode_update` a `false` para o papel do app, não há objeto escondido: é o
-- GRANT em falta (ou o RLS do bloco 4 a barrar o papel).
-- ============================================================================
