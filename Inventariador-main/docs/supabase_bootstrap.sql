-- ============================================================================
-- GBR KARDEK – Inventariador · Bootstrap do schema Supabase (multi-tenant)
-- ----------------------------------------------------------------------------
-- Cria as tabelas que o app grava (colunas verificadas nos payloads reais de
-- src/services/syncService.ts e src/services/supabaseService.ts).
--
-- COMO USAR:
--   1) Supabase Dashboard → SQL Editor → cole TODO o conteúdo → Run.
--   2) Idempotente: pode rodar de novo sem efeito colateral.
--   3) Se o projeto JÁ TINHA tabelas (schema legado), rode DEPOIS também:
--      docs/supabase_tenantid_migration.sql (normaliza a coluna `tenantid`).
--   4) HARDENING (recomendado depois do MVP): troque as políticas permissivas
--      abaixo por políticas restritas por `tenantid` (auth.uid()/JWT claim).
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

CREATE UNIQUE INDEX IF NOT EXISTS inventory_config_tenant_filial_key
  ON public.inventory_config (tenantid, filial);

-- ============================================================================
-- 3. AUDIT_LOGS — trilha de auditoria
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

CREATE TABLE IF NOT EXISTS public.campaign_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text,
  tenantid    text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  action      text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."asset-photos" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  photo_url   text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================================
-- 7. RLS — políticas PERMISSIVAS (MVP). O app usa a anon key; sem políticas,
--    toda gravação da nuvem falharia com 401/42501 (o app tolera, mas nada
--    sincronizaria). HARDENING depois: restringir por tenantid via JWT.
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

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'assets','inventory_config','audit_logs','user_permissions',
    'locations','campaigns','campaign_snapshots','asset_logs','asset-photos'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_%I_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY p_%I_all ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (opcional — rode depois):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================================
