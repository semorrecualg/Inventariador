-- ============================================================================
-- GBR KARDEK — RLS das tabelas de operação (exposição restante)
-- ----------------------------------------------------------------------------
-- Fecha o que ficou de fora de docs/supabase_privacidade_storage.sql (bucket,
-- `asset-photos`, `assets`, `user_permissions`):
--
--   inventory_config    — âncora GPS e config de cada filial: `anon` lia e
--   unit_configs          escrevia a geografia de TODOS os contratos.
--   audit_logs          — a trilha inteira (e-mails, ações, dados antigos/novos)
--                         era legível e apagável sem sessão.
--   locations           — unidades/endereços de qualquer contrato.
--   campaigns           — campanhas de qualquer filial, legíveis e apagáveis.
--   campaign_snapshots  — o laudo fechado (inventário completo em JSONB).
--   asset_logs          — histórico por ativo de qualquer contrato.
--   base_generation     — selo de geração da base, legível sem sessão.
--
-- O que passa a valer (tudo só para `authenticated`, sem privilégio de tabela
-- para `anon`):
--
--   • Escopo por contrato: a política aceita a linha quando o `tenantid` da
--     linha é o do perfil (`public.get_tenantid()`). `role = 'MASTER'` (dono
--     global) continua a atravessar contratos — é o que faz o download da
--     nuvem e a gestão de base funcionarem.
--   • Perfil SEM contrato (ex.: conta recém-registada, ainda não vinculada)
--     só alcança linhas sem contrato (`tenantid` vazio). Um ADMIN de contrato
--     fica no seu contrato, como em `assets`.
--   • Trilha append-only: `audit_logs` e `asset_logs` só têm SELECT e INSERT;
--     sem política de UPDATE/DELETE, ninguém reescreve nem apaga o histórico
--     pelo PostgREST. (O `upsert` da fila de auditoria passa a
--     `ignoreDuplicates`, que é `ON CONFLICT DO NOTHING` — reenviar não
--     duplica e não exige UPDATE.)
--   • `campaign_snapshots` é imutável: SELECT + INSERT, sem UPDATE/DELETE.
--   • `base_generation` é só leitura para `authenticated`; a escrita continua a
--     ser feita pelo SQL Editor (reset da base), nunca pelo cliente.
--
-- FORA DO ÂMBITO DESTE FICHEIRO: `unit_configs` continua com `p_all` para
-- `anon`. É a exposição seguinte (mesma receita: `p_tenant_all` com
-- `tenant_visible(tenantid)`), e está assinalada como pendência em
-- docs/GOVERNANCA.md. Não trate a base como fechada antes de a resolver.
--
-- PRÉ-REQUISITO: docs/supabase_rls_assets_permissoes.sql (cria `get_tenantid()`,
-- `is_master()` e `is_self_row()`). O bloco PASSO 0 recusa correr sem elas.
--
-- COMO USAR: colar o ficheiro inteiro no SQL Editor do Supabase. Se falhar, a
-- transacção reverte tudo. Pode ser executado mais de uma vez (idempotente).
--
-- ANTES DE APLICAR (só leitura) — bloco VERIFICAÇÃO no fim:
--   • linhas com `tenantid` vazio (inventory_config, locations, campaigns,
--     campaign_snapshots, asset_logs) ficam invisíveis para utilizadores com
--     contrato; corrigir o contrato dessas linhas primeiro se forem válidas;
--   • o dono global precisa de `role = 'MASTER'` para continuar a ver tudo;
--   • `fetchAllCampaigns`/`fetchLoadHistory` sem filtro continuam a devolver
--     apenas o contrato de quem pergunta (ou tudo, se MASTER).
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASSO 0 — pré-requisito: as funções de apoio do ficheiro anterior
-- ============================================================================
DO $$
BEGIN
  IF to_regprocedure('public.get_tenantid()') IS NULL
     OR to_regprocedure('public.is_master()') IS NULL THEN
    RAISE EXCEPTION
      'Funções em falta: corra primeiro docs/supabase_rls_assets_permissoes.sql (get_tenantid/is_master).';
  END IF;
END $$;

-- ============================================================================
-- PASSO 1 — tenant_visible(): a regra de contrato, num só sítio
--   SECURITY DEFINER porque chama get_tenantid()/is_master(), que leem
--   user_permissions; sem isso a política reentraria nas próprias políticas.
-- ============================================================================
SET LOCAL check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.tenant_visible(p_tenantid text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_master()
      OR (
        btrim(coalesce(public.get_tenantid(), '')) <> ''
        AND lower(btrim(coalesce(p_tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
      )
      OR (
        -- Perfil ainda sem contrato: só alcança linhas também sem contrato
        -- (é o caso dos eventos de login de uma conta recém-registada).
        btrim(coalesce(public.get_tenantid(), '')) = ''
        AND btrim(coalesce(p_tenantid, '')) = ''
      )
$$;

SET LOCAL check_function_bodies = on;

REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_visible(text) TO authenticated;

-- Colunas de contrato das trilhas (bases legadas podem ter só uma das grafias;
-- sem elas o `coalesce` das políticas falharia com 42703 e o script inteiro
-- reverteria).
-- A coluna de contrato das tabelas de operação: uma base legada pode não a ter
-- (as políticas rebentariam com 42703, como aconteceu com `tenant_id`).
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenant_id text;

-- Grafia legada (`tenant_id`) das trilhas: triggers criados fora do repositório
-- gravam essa coluna. Em vez de a referenciar nas políticas — o que rebenta com
-- 42703 numa base onde a coluna não existe —, este trigger copia o valor para
-- `tenantid` ANTES da verificação da política. Lê a coluna por `to_jsonb(NEW)`,
-- que devolve NULL quando ela não existe, em vez de falhar a compilar.
CREATE OR REPLACE FUNCTION public.tenantid_de_log_legado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF btrim(coalesce(NEW.tenantid, '')) = '' THEN
    NEW.tenantid := nullif(btrim(coalesce(to_jsonb(NEW) ->> 'tenant_id', '')), '');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS audit_logs_tenantid_legado ON public.audit_logs;
CREATE TRIGGER audit_logs_tenantid_legado
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.tenantid_de_log_legado();

DROP TRIGGER IF EXISTS asset_logs_tenantid_legado ON public.asset_logs;
CREATE TRIGGER asset_logs_tenantid_legado
  BEFORE INSERT ON public.asset_logs
  FOR EACH ROW EXECUTE FUNCTION public.tenantid_de_log_legado();

-- ============================================================================
-- PASSO 2 — inventory_config: âncora GPS e config por filial, no contrato
-- ============================================================================
ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.inventory_config;
DROP POLICY IF EXISTS p_tenant_all ON public.inventory_config;
CREATE POLICY p_tenant_all ON public.inventory_config
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.inventory_config FROM anon;

-- ============================================================================
-- PASSO 3 — locations: unidades/endereços do contrato
-- ============================================================================
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.locations;
DROP POLICY IF EXISTS p_tenant_all ON public.locations;
CREATE POLICY p_tenant_all ON public.locations
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.locations FROM anon;

-- ============================================================================
-- PASSO 4 — campaigns: campanhas do contrato (inclui DELETE)
--   O DELETE do app precisa de USING; sem ele o PostgREST devolvia 200 com 0
--   linhas e a campanha reaparecia no merge local+nuvem.
-- ============================================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.campaigns;
DROP POLICY IF EXISTS p_tenant_all ON public.campaigns;
CREATE POLICY p_tenant_all ON public.campaigns
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.campaigns FROM anon;

-- ============================================================================
-- PASSO 5 — campaign_snapshots: laudo fechado, imutável
--   O app só insere (ao encerrar a campanha) e lê (no histórico). Sem UPDATE
--   nem DELETE, um laudo fechado não pode ser reescrito pelo cliente.
-- ============================================================================
ALTER TABLE public.campaign_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_select ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_insert ON public.campaign_snapshots;
CREATE POLICY p_tenant_select ON public.campaign_snapshots
  FOR SELECT TO authenticated
  USING (public.tenant_visible(tenantid));

CREATE POLICY p_tenant_insert ON public.campaign_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.campaign_snapshots FROM anon;

-- ============================================================================
-- PASSO 6 — asset_logs: histórico por ativo, append-only
--   A política olha só para `tenantid`; o trigger do PASSO 1 já copiou a grafia
--   legada `tenant_id` para lá. Sem isso, uma linha legada sem `tenantid` seria
--   recusada e — por ser escrita por um trigger AFTER em `assets` — abortaria o
--   upsert do ativo inteiro.
-- ============================================================================
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.asset_logs;
CREATE POLICY p_tenant_select ON public.asset_logs
  FOR SELECT TO authenticated
  USING (public.tenant_visible(tenantid));

CREATE POLICY p_tenant_insert ON public.asset_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.asset_logs FROM anon;

-- ============================================================================
-- PASSO 7 — audit_logs: trilha append-only do contrato
--   Sem UPDATE nem DELETE. A fila de auditoria envia por
--   `client_event_id` com `ignoreDuplicates` (ON CONFLICT DO NOTHING), pelo que
--   um reenvio não duplica nem precisa de alterar a linha já arquivada.
-- ============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.audit_logs;
CREATE POLICY p_tenant_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.tenant_visible(tenantid));

CREATE POLICY p_tenant_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(tenantid));

REVOKE ALL ON public.audit_logs FROM anon;

-- ============================================================================
-- PASSO 8 — base_generation: selo de geração, só leitura
--   Uma linha, sem dados pessoais. O app lê antes de cada envio para recusar
--   uma base de geração anterior; a escrita é do SQL de reset (SQL Editor /
--   service_role), nunca do cliente — sem política de escrita, o RLS recusa.
-- ============================================================================
ALTER TABLE public.base_generation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.base_generation;
DROP POLICY IF EXISTS p_authenticated_select ON public.base_generation;
CREATE POLICY p_authenticated_select ON public.base_generation
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.base_generation FROM anon;

-- ============================================================================
-- VERIFICAÇÃO (descomentar depois do COMMIT — só leitura)
-- ----------------------------------------------------------------------------
-- 1) Nenhuma das 8 tabelas deve ter política para `anon`:
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public'
--      and tablename in ('inventory_config', 'audit_logs', 'campaigns',
--                        'campaign_snapshots', 'asset_logs', 'locations',
--                        'base_generation')
--    order by 1, 2;
--
-- 2) `anon` sem privilégio de tabela (0 linhas):
--   select table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('inventory_config', 'audit_logs', 'campaigns',
--                         'campaign_snapshots', 'asset_logs', 'locations',
--                         'base_generation')
--      and grantee in ('anon', 'PUBLIC');
--
-- 3) Linhas sem contrato — invisíveis para utilizadores com contrato:
--   select 'inventory_config' as tabela, count(*) from public.inventory_config
--    where btrim(coalesce(tenantid, '')) = ''
--   union all select 'locations', count(*) from public.locations
--    where btrim(coalesce(tenantid, '')) = ''
--   union all select 'campaigns', count(*) from public.campaigns
--    where btrim(coalesce(tenantid, '')) = ''
--   union all select 'campaign_snapshots', count(*) from public.campaign_snapshots
--    where btrim(coalesce(tenantid, '')) = ''
--   union all select 'asset_logs', count(*) from public.asset_logs
--    where btrim(coalesce(tenantid, '')) = ''
--   union all select 'audit_logs', count(*) from public.audit_logs
--    where btrim(coalesce(tenantid, '')) = '';
--
-- 4) Trilha append-only (nenhuma política de UPDATE/DELETE nestas duas):
--   select tablename, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('audit_logs', 'asset_logs', 'campaign_snapshots')
--    order by 1, 2;   -- só SELECT/INSERT
--
-- 5) Dono global: `role = 'MASTER'` é o que atravessa contratos:
--   select email, role, is_admin, tenantid from public.user_permissions
--    where upper(btrim(coalesce(role, ''))) = 'MASTER';
--
-- 6) `unit_configs` continua ABERTA a `anon` (fora do âmbito deste ficheiro):
--   select policyname, roles from pg_policies
--    where schemaname = 'public' and tablename = 'unit_configs';
-- ============================================================================

COMMIT;
