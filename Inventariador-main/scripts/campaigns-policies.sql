-- ============================================================================
-- campaigns-policies.sql — LEITURA APENAS (diagnóstico de RLS)
-- ----------------------------------------------------------------------------
-- Lista as políticas RLS de public.campaigns para confirmar se existe uma
-- política de DELETE que alcance as linhas do contrato.
--
-- Porquê: o app apaga a campanha no SQLite e chama
-- `supabase.from('campaigns').delete().eq('id', ...)`. Se a política de DELETE
-- não existir (ou o USING não alcançar a linha), o PostgREST responde 200 com
-- 0 linhas — sem erro — e a campanha fica só na nuvem. O `fetchCampaigns` faz
-- merge local+nuvem, por isso a linha reaparece no ecrã.
--
-- Como usar: Supabase → SQL Editor → colar → Run. Não altera nada.
-- Todas as instruções aqui são SELECT: nada é criado, alterado ou apagado.
-- ============================================================================

-- 1. RLS está ligada nesta tabela?
select
  n.nspname                                    as schema,
  c.relname                                    as tabela,
  c.relrowsecurity                             as rls_habilitada,
  c.relforcerowsecurity                        as rls_forcada_para_dono
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'campaigns';

-- 2. Todas as políticas de public.campaigns (o essencial para o DELETE).
--    `cmd`: ALL | SELECT | INSERT | UPDATE | DELETE
--    `roles`: quem a política alcança ({public} = todos, inclui anon)
--    `qual`: condição USING (quais linhas EXISTENTES a política deixa ver/apagar)
--    `with_check`: condição WITH CHECK (linhas NOVAS/alteradas)
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename  = 'campaigns'
order by
  case cmd when 'DELETE' then 0 when 'ALL' then 1 when 'UPDATE' then 2
           when 'INSERT' then 3 when 'SELECT' then 4 else 5 end,
  policyname;

-- 3. Veredicto rápido: existe política que permita DELETE?
select
  case
    when count(*) = 0 then
      'SEM politica de DELETE/ALL em public.campaigns: o DELETE do app nunca apaga linha nenhuma (0 linhas, sem erro).'
    else
      'Existe politica de DELETE/ALL: confira em `roles` se inclui o papel usado pelo app e em `qual` se alcanca a linha.'
  end as veredicto,
  count(*) as politicas_delete_ou_all
from pg_policies
where schemaname = 'public'
  and tablename  = 'campaigns'
  and cmd in ('DELETE', 'ALL');

-- 4. Privilégios de tabela por papel (o GRANT não chega: RLS decide depois).
--    `anon` é o papel do build sem login; `authenticated` é o do usuário logado.
select
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'campaigns'
  and grantee in ('anon', 'authenticated')
group by grantee
order by grantee;

-- 5. Quantas campanhas o papel atual consegue ver (contexto do merge).
--    Rodado no SQL Editor (service role) mostra a tabela inteira; a contagem que
--    interessa é a que o app vê — o teste real é `GET /rest/v1/campaigns`.
select
  tenantid,
  count(*) as campanhas
from public.campaigns
group by tenantid
order by tenantid;
