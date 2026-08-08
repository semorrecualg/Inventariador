-- ============================================================================
-- GBR KARDEK – Inventariador · Bootstrap do schema Supabase (multi-tenant)
-- ----------------------------------------------------------------------------
-- Cria as tabelas que o app grava (colunas verificadas nos payloads reais de
-- src/services/syncService.ts e src/services/supabaseService.ts).
--
-- COMO USAR:
--   1) Supabase Dashboard → SQL Editor → New query → cole TODO o conteúdo → Run.
--   2) Idempotente: pode rodar de novo sem efeito colateral.
--   3) RESILIENTE A SCHEMA LEGADO: se o projeto JÁ TINHA tabelas (ex.: criadas
--      por versões anteriores), os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
--      abaixo garantem as colunas críticas (created_at/updated_at/tenantid...)
--      SEM destruir dados. Isso corrige o erro 42703 ("column created_at does
--      not exist") que ocorre quando a tabela legada não tem a coluna.
--   4) Se a estrutura legada for INCOMPATÍVEL (ex.: tabela sem coluna `id`),
--      drope SÓ a tabela conflitante e rode o script de novo — os dados serão
--      re-sincronizados do dispositivo:
--        DROP TABLE IF EXISTS public.<tabela>;  -- ex.: public.audit_logs
--   5) HARDENING (recomendado depois do MVP): troque as políticas permissivas
--      abaixo por políticas restritas por `tenantid` (auth.uid()/JWT claim).
--
-- NOTA IMPORTANTE (erros 42601/26000): as políticas RLS são escritas de forma
-- ESTÁTICA (uma instrução DROP + CREATE POLICY por tabela) — sem DO/EXECUTE/
-- format() dinâmico. Isso evita (a) o nome de política inválido p_"asset-photos"_all
-- e (b) o erro "prepared statement format does not exist" quando o editor divide
-- o script. O nome da política é fixo (`p_all`) — único por tabela.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ASSETS — espelho da tabela de ativos (payload completo do syncService)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid          text NOT NULL,
  filial            text,
  status            text,
  etiqueta          text,
  qt                numeric,
  descricaodoativo  text,
  serial            text,
  dataaqusic        text,
  cnpj              text,
  nomefornecedor    text,
  notafiscal        text,
  endereco          text,
  registro          text,
  subreg            text,
  databaixa         text,
  contacontabil     text,
  primarykey        text,
  centrodecusto     text,
  vlraquisic        numeric,
  sn1_recno         numeric,
  sn3_recno         numeric,
  DE_PARA           text,
  gps_lat           numeric,
  gps_lng           numeric,
  currentCampaignId text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Garante colunas críticas em schema legado (no-op se a tabela foi criada acima)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS primarykey text;

-- A fila de sync usa upsert por primarykey (sem id duplicado por ativo)
CREATE UNIQUE INDEX IF NOT EXISTS assets_primarykey_key
  ON public.assets (primarykey) WHERE primarykey IS NOT NULL;

CREATE INDEX IF NOT EXISTS assets_tenantid_idx ON public.assets (tenantid);
CREATE INDEX IF NOT EXISTS assets_tenant_filial_idx ON public.assets (tenantid, filial);

-- ============================================================================
-- 2. INVENTORY_CONFIG — config de unidade + âncora GPS (upsert por filial)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text NOT NULL,
  filial      text,
  data        jsonb,
  lat         numeric,
  lng         numeric,
  radius_meters numeric,
  is_active   boolean DEFAULT true,
  updated_by  text,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS lng numeric;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS radius_meters numeric;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_config_tenant_filial_key
  ON public.inventory_config (tenantid, filial);

-- ============================================================================
-- 3. AUDIT_LOGS — trilha de auditoria
--    (FONTE DO ERRO 42703: tabela legada sem a coluna created_at — corrigido
--     pelos ALTERs abaixo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenantid    text,
  user_email  text,
  action      text,
  table_name  text,
  record_id   text,
  details     text,
  origin      text,
  new_data    jsonb,
  old_data    jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data jsonb;

CREATE INDEX IF NOT EXISTS audit_logs_tenantid_idx ON public.audit_logs (tenantid);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- ============================================================================
-- 4. USER_PERMISSIONS — perfil de usuário (upsert onConflict email)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  username    text,
  name        text,
  role        text,
  is_admin    boolean DEFAULT false,
  tenantid    text,
  filial      text,
  units       jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS units jsonb;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_email_key
  ON public.user_permissions (email);

-- ============================================================================
-- 5. LOCATIONS — unidades/endereços (unique name+tenantid exigido pelo app)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  tenantid    text,
  data        jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS data jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS locations_name_tenantid_key
  ON public.locations (name, tenantid);

-- ============================================================================
-- 6. CAMPANHAS / SNAPSHOTS / ASSET_LOGS / ASSET-PHOTOS
--    (colunas mínimas compatíveis com os upserts do app; colunas extras não
--     quebram o PostgREST — colunas FALTANTES sim)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  filial      text,
  name        text,
  status      text,
  data        jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data jsonb;

CREATE TABLE IF NOT EXISTS public.campaign_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text,
  tenantid    text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS campaign_id text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS data jsonb;

CREATE TABLE IF NOT EXISTS public.asset_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  action      text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS data jsonb;

CREATE TABLE IF NOT EXISTS public."asset-photos" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  photo_url   text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS data jsonb;

-- ============================================================================
-- 7. RLS — políticas PERMISSIVAS (MVP), estáticas e idempotentes.
--    O app usa a anon key; sem políticas, toda gravação da nuvem falharia com
--    401/42501 (o app tolera, mas nada sincronizaria).
--    HARDENING depois: restringir por tenantid via JWT.
--    Nome de política fixo `p_all` (único por tabela) — nunca interpolado.
-- ============================================================================
ALTER TABLE public.assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."asset-photos"    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.assets;
CREATE POLICY p_all ON public.assets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.inventory_config;
CREATE POLICY p_all ON public.inventory_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.audit_logs;
CREATE POLICY p_all ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.user_permissions;
CREATE POLICY p_all ON public.user_permissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.locations;
CREATE POLICY p_all ON public.locations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.campaigns;
CREATE POLICY p_all ON public.campaigns FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.campaign_snapshots;
CREATE POLICY p_all ON public.campaign_snapshots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.asset_logs;
CREATE POLICY p_all ON public.asset_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public."asset-photos";
CREATE POLICY p_all ON public."asset-photos" FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (opcional — rode depois):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'audit_logs' ORDER BY ordinal_position;
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
-- ============================================================================
