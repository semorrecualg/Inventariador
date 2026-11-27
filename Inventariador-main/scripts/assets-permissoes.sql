-- ============================================================================
-- assets-permissoes.sql — «permission denied for table assets» (42501)
--
-- ONDE CORRER: SQL Editor do Supabase (cole o ficheiro inteiro) ou `psql`.
-- IDEMPOTENTE: pode correr as vezes que forem precisas; não apaga linhas nem
-- tabelas.
--
-- QUANDO CORRER
--   O cartão do ativo mostra
--     «FALHA DE ENVIO — Erro Supabase: [42501] permission denied for table assets»
--   e o envio nunca sobe (a conferência fica só no aparelho).
--
-- O QUE É — E PORQUE NÃO SE RESOLVE A APAGAR A BASE DO APARELHO
--   42501 é recusa de PRIVILÉGIO, não de dados. O papel com que o pedido chega
--   à nuvem (`authenticated`, com sessão; `anon`, sem sessão) não tem
--   INSERT/UPDATE na tabela. A política `p_all` pode existir e mesmo assim nada
--   entrar: o RLS decide DEPOIS do GRANT, e sem GRANT o Postgres responde
--   antes de chegar à política. Por isso apagar a base do aparelho não muda
--   nada — o problema está na nuvem, não no aparelho, e o ativo guardado
--   localmente está bom.
--
--   Não confundir com «new row violates row-level security policy» (também
--   42501): essa é a POLÍTICA a recusar a linha; esta é a falta de GRANT (ou
--   um privilégio de coluna restringido).
--
-- COMO ISTO ACONTECE
--   Projeto novo (docs/supabase_bootstrap.sql) recebe os GRANTs do Supabase
--   por omissão. A tabela perde-os quando é recriada por outro dono, quando os
--   privilégios são revogados à mão (endurecimento de RLS) ou quando a política
--   foi endurecida para `authenticated` e o pedido chega sem sessão (`anon`).
--
-- O QUE ESTE SCRIPT FAZ
--   1. diagnóstico — dono, RLS, privilégios de tabela e de coluna, políticas;
--   2. repõe USAGE no schema e SELECT/INSERT/UPDATE/DELETE a `anon` e
--      `authenticated` nas 10 tabelas do app (e ALL a `service_role`);
--   3. repõe a política `p_all` permissiva nas mesmas tabelas (a mesma do
--      bootstrap — este script não endurece nem afrouxa o modelo);
--   4. recarrega o cache de esquema do PostgREST;
--   5. prova o resultado com `has_table_privilege` (todos os valores têm de
--      sair `true`).
-- ============================================================================

-- ============================================================================
-- 1. DIAGNÓSTICO — o estado da nuvem ANTES da correção
--    Guarde esta saída: se o erro voltar depois do script, é aqui que se vê
--    qual dos três (dono, privilégio, política) voltou a mudar.
-- ============================================================================

-- 1.1 A tabela existe? É tabela ou vista? Quem é o dono? O RLS está forçado?
select c.relname                                  as tabela,
       c.relkind                                  as tipo, -- r = tabela, v = vista, p = particionada
       pg_get_userbyid(c.relowner)                as dono,
       c.relrowsecurity                           as rls_ligado,
       c.relforcerowsecurity                      as rls_forcado
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('assets', 'inventory_config', 'unit_configs', 'audit_logs',
                     'asset_logs', 'user_permissions', 'locations', 'campaigns',
                     'campaign_snapshots', 'asset-photos', 'base_generation')
 order by c.relname;

-- 1.2 Privilégios de TABELA em `assets` (o que o pedido pode fazer).
--     Sem INSERT/UPDATE para o papel que o app usa, é este o 42501.
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'assets'
 order by grantee, privilege_type;

-- 1.3 Privilégios de COLUNA (o que produz a MESMA mensagem, com GRANT de
--     tabela ausente). `attacl` preenchido = há concessões por coluna.
select attname as coluna, attacl as privilegios_de_coluna
  from pg_attribute
 where attrelid = 'public.assets'::regclass
   and attacl is not null;

-- 1.4 Políticas em `assets` — permissivas e restritivas. Uma restritiva
--     (`as restrictive`) acrescenta condições que a `p_all` não anula.
select policyname, permissive, cmd, roles::text as papeis, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename = 'assets';

-- ============================================================================
-- 2. CORREÇÃO — privilégios + política permissiva (tudo ou nada)
--    GRANT a nível de tabela cobre também as colunas: se existirem
--    concessões por coluna a restringir, esta linha repõe tudo.
-- ============================================================================
begin;

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.assets             to anon, authenticated;
grant select, insert, update, delete on public.inventory_config   to anon, authenticated;
grant select, insert, update, delete on public.unit_configs       to anon, authenticated;
grant select, insert, update, delete on public.audit_logs         to anon, authenticated;
grant select, insert, update, delete on public.asset_logs         to anon, authenticated;
grant select, insert, update, delete on public.user_permissions   to anon, authenticated;
grant select, insert, update, delete on public.locations          to anon, authenticated;
grant select, insert, update, delete on public.campaigns          to anon, authenticated;
grant select, insert, update, delete on public.campaign_snapshots to anon, authenticated;
grant select, insert, update, delete on public."asset-photos"     to anon, authenticated;
grant select                         on public.base_generation    to anon, authenticated;

-- `service_role` ignora o RLS, mas continua a precisar do privilégio de tabela.
grant all privileges on public.assets             to service_role;
grant all privileges on public.inventory_config   to service_role;
grant all privileges on public.unit_configs       to service_role;
grant all privileges on public.audit_logs         to service_role;
grant all privileges on public.asset_logs         to service_role;
grant all privileges on public.user_permissions   to service_role;
grant all privileges on public.locations          to service_role;
grant all privileges on public.campaigns          to service_role;
grant all privileges on public.campaign_snapshots to service_role;
grant all privileges on public."asset-photos"     to service_role;

-- Tabelas criadas daqui para a frente nascem com os mesmos privilégios (era o
-- que o Supabase já fazia por omissão; isto repõe-no se tiver sido revogado).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- Políticas: as MESMAS do bootstrap (permissivas, MVP). Se o diagnóstico 1.4
-- listar políticas restritivas (`as restrictive`), reveja-as antes de concluir
-- que esta política chega — este script não as remove.
alter table public.assets             enable row level security;
alter table public.inventory_config   enable row level security;
alter table public.unit_configs       enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.asset_logs         enable row level security;
alter table public.user_permissions   enable row level security;
alter table public.locations          enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_snapshots enable row level security;
alter table public."asset-photos"     enable row level security;
alter table public.base_generation    enable row level security;

drop policy if exists p_all on public.assets;
create policy p_all on public.assets for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.inventory_config;
create policy p_all on public.inventory_config for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.unit_configs;
create policy p_all on public.unit_configs for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.audit_logs;
create policy p_all on public.audit_logs for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.asset_logs;
create policy p_all on public.asset_logs for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.user_permissions;
create policy p_all on public.user_permissions for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.locations;
create policy p_all on public.locations for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.campaigns;
create policy p_all on public.campaigns for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public.campaign_snapshots;
create policy p_all on public.campaign_snapshots for all to anon, authenticated using (true) with check (true);

drop policy if exists p_all on public."asset-photos";
create policy p_all on public."asset-photos" for all to anon, authenticated using (true) with check (true);

-- O selo de geração só é lido pelo app; quem o escreve é o SQL de reset.
drop policy if exists p_all on public.base_generation;
create policy p_all on public.base_generation for select to anon, authenticated using (true);

-- Sem este aviso o PostgREST pode servir o cache antigo até ao próximo reload.
notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- 3. PROVA — todos os valores têm de sair `true`
--    `true` em `insert`/`update` para os dois papéis é o que faltava para o
--    cartão deixar de dizer «permission denied for table assets».
-- ============================================================================
select has_schema_privilege('anon', 'public', 'USAGE')                 as anon_schema,
       has_table_privilege('anon', 'public.assets', 'SELECT')          as anon_select,
       has_table_privilege('anon', 'public.assets', 'INSERT')          as anon_insert,
       has_table_privilege('anon', 'public.assets', 'UPDATE')          as anon_update,
       has_table_privilege('anon', 'public.assets', 'DELETE')          as anon_delete,
       has_schema_privilege('authenticated', 'public', 'USAGE')        as autenticado_schema,
       has_table_privilege('authenticated', 'public.assets', 'SELECT') as autenticado_select,
       has_table_privilege('authenticated', 'public.assets', 'INSERT') as autenticado_insert,
       has_table_privilege('authenticated', 'public.assets', 'UPDATE') as autenticado_update,
       has_table_privilege('authenticated', 'public.assets', 'DELETE') as autenticado_delete;

-- ----------------------------------------------------------------------------
-- PROVA OPCIONAL de RLS (o GRANT não basta se uma política restritiva recusar
-- a linha). Descomente, troque `__PROVA__` por uma chave que não exista e
-- execute: o `insert` como `authenticated` tem de passar. O `rollback` garante
-- que nada fica na tabela.
--
-- begin;
--   set local role authenticated;
--   insert into public.assets (tenantid, primarykey, filial, descricaodoativo, status, qt, vlraquisic)
--   values ('__PROVA__', '__PROVA__', '__PROVA__', 'prova de permissao', 'ATIVO', 1, 0);
-- rollback;
--
-- Se o `set local role` responder «permission denied to set role
-- "authenticated"», o SQL Editor não deixa trocar de papel — não é falha da
-- correção: valide pelo app (conferir um ativo e ver o cartão deixar de mostrar
-- «Falha de envio»).
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 4. DEPOIS DO SCRIPT
--   • No aparelho, abra a ficha do ativo e toque em «Tentar agora». O carimbo
--     «Falha de envio» desaparece no primeiro envio confirmado.
--   • Nada precisa de ser apagado: a base local continua válida e o que faltava
--     era o direito de escrever na nuvem.
--   • Se o erro voltar, corra outra vez a secção 1 e compare com a saída
--     anterior (dono, privilégios, políticas) — o que mudou é a causa.
-- ============================================================================
