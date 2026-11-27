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
-- O QUE DEVOLVER: o resultado de cada bloco (ou «0 linhas») e o `current_user`
-- do bloco 0.
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

-- 3) Privilégios por papel — a resposta directa ao 42501
select table_schema, table_name, grantee, privilege_type, is_grantable
  from information_schema.role_table_grants
 where table_name = 'dics'
 order by table_schema, grantee, privilege_type;

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
-- nome citado na mensagem é o dessa variante.
-- ============================================================================
