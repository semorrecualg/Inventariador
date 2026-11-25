-- ============================================================================
-- GBR KARDEK — RLS das tabelas de operação (exposição restante)
-- ----------------------------------------------------------------------------
-- Fecha o que ficou de fora de docs/supabase_privacidade_storage.sql e
-- docs/supabase_rls_assets_permissoes.sql:
--
--   inventory_config, locations, campaigns, campaign_snapshots, asset_logs,
--   audit_logs e base_generation tinham `p_all` para `anon`: a anon key lia e
--   apagava a âncora GPS de todas as filiais, a trilha inteira, as campanhas e
--   os laudos fechados, o histórico por ativo e as localidades de qualquer
--   contrato.
--
-- O que passa a valer (tudo só para `authenticated`, sem privilégio de tabela
-- para `anon`):
--
--   • Escopo por contrato: `public.tenant_visible(tenantid)` aceita a linha
--     quando o contrato é o do perfil. `role = 'MASTER'` (dono global) atravessa
--     contratos; um perfil ainda SEM contrato só alcança linhas sem contrato
--     (é o caso dos eventos de login de uma conta recém-registada).
--   • inventory_config/locations/campaigns: contrato inteiro (inclui DELETE).
--   • audit_logs, asset_logs, campaign_snapshots: append-only — só SELECT e
--     INSERT. Sem política de UPDATE/DELETE, o PostgREST não reescreve nem
--     apaga a trilha nem o laudo (o comando afecta 0 linhas).
--   • base_generation: só leitura; a escrita é do SQL de reset (SQL Editor).
--   • A grafia legada `tenant_id` (triggers antigos, criados fora do
--     repositório) NÃO é referenciada nas políticas: numa base onde a coluna
--     não existe isso rebentava o script com 42703. Um trigger BEFORE INSERT
--     copia-a para `tenantid` lendo-a por `to_jsonb(NEW)`, que devolve NULL
--     quando a coluna não existe.
--
-- FORA DO ÂMBITO: `unit_configs` continua com `p_all` para `anon` — é a
-- exposição seguinte (ver docs/GOVERNANCA.md). A base não está fechada antes
-- de isso ser resolvido.
--
-- COMO USAR: colar o ficheiro INTEIRO no SQL Editor do Supabase e executar.
-- Cada instrução está completa numa só linha e as funções são criadas aqui
-- mesmo: o script corre também em editores que executam por linhas/trechos e
-- não depende de outro ficheiro ter sido aplicado antes (as funções são as
-- mesmas de docs/supabase_rls_assets_permissoes.sql, recriadas com
-- CREATE OR REPLACE). Uma linha começada por `USING` ou `WITH CHECK` é a
-- continuação de um CREATE POLICY — não a executes isolada.
--
-- Se uma instrução falhar, o erro indica a linha; o ficheiro é idempotente e
-- pode ser executado de novo depois de corrigir.
--
-- ANTES DE APLICAR (só leitura) — bloco VERIFICAÇÃO no fim:
--   • linhas com `tenantid` vazio ficam invisíveis para quem tem contrato;
--   • o dono global precisa de `role = 'MASTER'` para continuar a ver tudo.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Funções de apoio (idempotentes, SECURITY DEFINER: leem user_permissions)
-- ----------------------------------------------------------------------------
-- A linha pertence ao utilizador do pedido (por id ou e-mail). Criada primeiro:
-- as funções seguintes chamam-na e o Postgres valida o corpo na criação.
CREATE OR REPLACE FUNCTION public.is_self_row(p_id uuid, p_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ SELECT auth.uid() IS NOT NULL AND (p_id = auth.uid() OR (btrim(coalesce(auth.jwt() ->> 'email', '')) <> '' AND lower(btrim(coalesce(p_email, ''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))))) $fn$;

-- Contrato do utilizador autenticado: casa pelo id do Auth e, como rede de
-- segurança, pelo e-mail do JWT (perfis legados com id nulo/desalinhado).
CREATE OR REPLACE FUNCTION public.get_tenantid() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ SELECT up.tenantid FROM public.user_permissions up WHERE public.is_self_row(up.id, up.email) ORDER BY (up.id = auth.uid()) DESC LIMIT 1 $fn$;

-- Único perfil com visão entre contratos (dono global).
CREATE OR REPLACE FUNCTION public.is_master() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ SELECT EXISTS (SELECT 1 FROM public.user_permissions up WHERE public.is_self_row(up.id, up.email) AND upper(btrim(coalesce(up.role, ''))) = 'MASTER') $fn$;

-- Regra de contrato das tabelas de operação: MASTER atravessa; perfil com
-- contrato vê o seu; perfil sem contrato só alcança linhas sem contrato.
CREATE OR REPLACE FUNCTION public.tenant_visible(p_tenantid text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ SELECT public.is_master() OR (btrim(coalesce(public.get_tenantid(), '')) <> '' AND lower(btrim(coalesce(p_tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))) OR (btrim(coalesce(public.get_tenantid(), '')) = '' AND btrim(coalesce(p_tenantid, '')) = '') $fn$;

-- Copia a grafia legada `tenant_id` para `tenantid` antes da política. Lê a
-- coluna por to_jsonb(NEW): devolve NULL quando ela não existe, em vez de
-- falhar a compilar (42703).
CREATE OR REPLACE FUNCTION public.tenantid_de_log_legado() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ BEGIN IF btrim(coalesce(NEW.tenantid, '')) = '' THEN NEW.tenantid := nullif(btrim(coalesce(to_jsonb(NEW) ->> 'tenant_id', '')), ''); END IF; RETURN NEW; END $fn$;

REVOKE ALL ON FUNCTION public.get_tenantid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenantid() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenantid() TO authenticated;
REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_self_row(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.is_master() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_master() TO authenticated;
REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_visible(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Colunas de contrato (uma base legada pode não as ter; sem elas as
--    políticas falhariam com 42703) e trigger da grafia legada das trilhas.
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenant_id text;

DROP TRIGGER IF EXISTS audit_logs_tenantid_legado ON public.audit_logs;
CREATE TRIGGER audit_logs_tenantid_legado BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.tenantid_de_log_legado();
DROP TRIGGER IF EXISTS asset_logs_tenantid_legado ON public.asset_logs;
CREATE TRIGGER asset_logs_tenantid_legado BEFORE INSERT ON public.asset_logs FOR EACH ROW EXECUTE FUNCTION public.tenantid_de_log_legado();

-- ----------------------------------------------------------------------------
-- 3. inventory_config — âncora GPS e config por filial, no contrato
-- ----------------------------------------------------------------------------
ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.inventory_config;
DROP POLICY IF EXISTS p_tenant_all ON public.inventory_config;
CREATE POLICY p_tenant_all ON public.inventory_config FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.inventory_config FROM anon;

-- ----------------------------------------------------------------------------
-- 4. locations — unidades/endereços do contrato
-- ----------------------------------------------------------------------------
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.locations;
DROP POLICY IF EXISTS p_tenant_all ON public.locations;
CREATE POLICY p_tenant_all ON public.locations FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.locations FROM anon;

-- ----------------------------------------------------------------------------
-- 5. campaigns — campanhas do contrato (o ALL inclui o DELETE do app)
-- ----------------------------------------------------------------------------
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.campaigns;
DROP POLICY IF EXISTS p_tenant_all ON public.campaigns;
CREATE POLICY p_tenant_all ON public.campaigns FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.campaigns FROM anon;

-- ----------------------------------------------------------------------------
-- 6. campaign_snapshots — laudo fechado, imutável (só SELECT/INSERT)
-- ----------------------------------------------------------------------------
ALTER TABLE public.campaign_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_select ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_insert ON public.campaign_snapshots;
CREATE POLICY p_tenant_select ON public.campaign_snapshots FOR SELECT TO authenticated USING (public.tenant_visible(tenantid));
CREATE POLICY p_tenant_insert ON public.campaign_snapshots FOR INSERT TO authenticated WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.campaign_snapshots FROM anon;

-- ----------------------------------------------------------------------------
-- 7. asset_logs — histórico por ativo, append-only (só SELECT/INSERT)
-- ----------------------------------------------------------------------------
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.asset_logs;
CREATE POLICY p_tenant_select ON public.asset_logs FOR SELECT TO authenticated USING (public.tenant_visible(tenantid));
CREATE POLICY p_tenant_insert ON public.asset_logs FOR INSERT TO authenticated WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.asset_logs FROM anon;

-- ----------------------------------------------------------------------------
-- 8. audit_logs — trilha do contrato, append-only (só SELECT/INSERT)
--    A fila do app envia por `client_event_id` com `ignoreDuplicates`
--    (ON CONFLICT DO NOTHING): reenviar não duplica nem exige UPDATE.
-- ----------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.audit_logs;
CREATE POLICY p_tenant_select ON public.audit_logs FOR SELECT TO authenticated USING (public.tenant_visible(tenantid));
CREATE POLICY p_tenant_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.audit_logs FROM anon;

-- ----------------------------------------------------------------------------
-- 9. base_generation — selo de geração, só leitura para authenticated
-- ----------------------------------------------------------------------------
ALTER TABLE public.base_generation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.base_generation;
DROP POLICY IF EXISTS p_authenticated_select ON public.base_generation;
CREATE POLICY p_authenticated_select ON public.base_generation FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.base_generation FROM anon;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (só leitura — correr depois)
-- ----------------------------------------------------------------------------
-- 1) Nenhuma das 8 tabelas deve ter política para `anon`:
--   select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' and tablename in ('inventory_config', 'audit_logs', 'campaigns', 'campaign_snapshots', 'asset_logs', 'locations', 'base_generation') order by 1, 2;
--
-- 2) `anon` sem privilégio de tabela (0 linhas):
--   select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name in ('inventory_config', 'audit_logs', 'campaigns', 'campaign_snapshots', 'asset_logs', 'locations', 'base_generation') and grantee in ('anon', 'PUBLIC');
--
-- 3) Linhas sem contrato — invisíveis para utilizadores com contrato:
--   select 'inventory_config' as tabela, count(*) from public.inventory_config where btrim(coalesce(tenantid, '')) = '' union all select 'locations', count(*) from public.locations where btrim(coalesce(tenantid, '')) = '' union all select 'campaigns', count(*) from public.campaigns where btrim(coalesce(tenantid, '')) = '' union all select 'campaign_snapshots', count(*) from public.campaign_snapshots where btrim(coalesce(tenantid, '')) = '' union all select 'asset_logs', count(*) from public.asset_logs where btrim(coalesce(tenantid, '')) = '' union all select 'audit_logs', count(*) from public.audit_logs where btrim(coalesce(tenantid, '')) = '';
--
-- 4) Trilha e laudos append-only (só SELECT/INSERT):
--   select tablename, cmd from pg_policies where schemaname = 'public' and tablename in ('audit_logs', 'asset_logs', 'campaign_snapshots') order by 1, 2;
--
-- 5) Dono global precisa de `role = 'MASTER'` para atravessar contratos:
--   select email, role, is_admin, tenantid from public.user_permissions where upper(btrim(coalesce(role, ''))) = 'MASTER';
--
-- 6) `unit_configs` continua ABERTA a `anon` (fora do âmbito deste ficheiro):
--   select policyname, roles from pg_policies where schemaname = 'public' and tablename = 'unit_configs';
-- ============================================================================
