-- ===============================================================
-- GBR v24.50 - CORREÇÃO DEFINITIVA: RPC E RLS (APP_METADATA)
-- ===============================================================

-- 1. Funções de Apoio para RLS (Usando app_metadata para segurança máxima)
CREATE OR REPLACE FUNCTION get_auth_tenant() RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenantid')::TEXT;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT 
    (auth.jwt() -> 'app_metadata' ->> 'role')::TEXT IN ('ADMIN', 'MASTER') OR
    (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com';
$$ LANGUAGE sql STABLE;

-- 2. RPC para salvar Unit Config (Contorna erro PGRST205 de cache)
CREATE OR REPLACE FUNCTION save_unit_config(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_meters INTEGER,
  p_is_active BOOLEAN,
  p_updated_by TEXT,
  p_unit_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id TEXT;
BEGIN
  v_tenant_id := get_auth_tenant();

  IF v_tenant_id IS NULL OR v_tenant_id = '' THEN
    RETURN json_build_object('status', 'error', 'message', 'Sessão inválida: Tenant não identificado');
  END IF;

  INSERT INTO public.unit_configs (
    tenant_id, unit_id, lat, lng, radius_meters, is_active, updated_by, updated_at
  )
  VALUES (
    v_tenant_id, p_unit_id, p_lat, p_lng, p_radius_meters, p_is_active, p_updated_by, NOW()
  )
  ON CONFLICT (tenant_id, unit_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    radius_meters = EXCLUDED.radius_meters,
    is_active = EXCLUDED.is_active,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  RETURN json_build_object('status', 'success', 'message', 'Unidade ' || p_unit_id || ' configurada');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- 3. Políticas de Segurança (RLS) - Mapeamento Exato de Colunas

-- Audit Logs (tenant_id)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Audit Logs: Read Access" ON public.audit_logs;
CREATE POLICY "Audit Logs: Read Access" ON public.audit_logs
  FOR SELECT TO authenticated 
  USING (tenant_id = get_auth_tenant() OR user_email = (auth.jwt() ->> 'email') OR is_admin());

-- Inventory Campaigns (tenantid - Conforme erro 42703)
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Campaigns: Read Access" ON public.inventory_campaigns;
DROP POLICY IF EXISTS "Campaigns: Admin Write" ON public.inventory_campaigns;

CREATE POLICY "Campaigns: Read Access" ON public.inventory_campaigns
  FOR SELECT TO authenticated 
  USING (tenantid = get_auth_tenant() OR is_admin());

CREATE POLICY "Campaigns: Admin Write" ON public.inventory_campaigns
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Unit Configs (tenant_id)
ALTER TABLE public.unit_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Unit Configs: Read Access" ON public.unit_configs;
DROP POLICY IF EXISTS "Unit Configs: Admin Write" ON public.unit_configs;

CREATE POLICY "Unit Configs: Read Access" ON public.unit_configs
  FOR SELECT TO authenticated 
  USING (tenant_id = get_auth_tenant() OR is_admin());

CREATE POLICY "Unit Configs: Admin Write" ON public.unit_configs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Asset Depreciation History (_tenantid)
ALTER TABLE public.asset_depreciation_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Depreciation: Read Access" ON public.asset_depreciation_history;
DROP POLICY IF EXISTS "Depreciation: Admin Insert" ON public.asset_depreciation_history;
DROP POLICY IF EXISTS "Depreciation: Admin Update" ON public.asset_depreciation_history;

CREATE POLICY "Depreciation: Read Access" ON public.asset_depreciation_history
  FOR SELECT TO authenticated 
  USING (_tenantid = get_auth_tenant() OR is_admin());

CREATE POLICY "Depreciation: Admin Insert" ON public.asset_depreciation_history
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Depreciation: Admin Update" ON public.asset_depreciation_history
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Asset Groups (_tenantid)
ALTER TABLE public.asset_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Groups: Read Access" ON public.asset_groups;
DROP POLICY IF EXISTS "Groups: Admin Insert" ON public.asset_groups;
DROP POLICY IF EXISTS "Groups: Admin Update" ON public.asset_groups;

CREATE POLICY "Groups: Read Access" ON public.asset_groups
  FOR SELECT TO authenticated 
  USING (_tenantid = get_auth_tenant() OR is_admin());

CREATE POLICY "Groups: Admin Insert" ON public.asset_groups
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Groups: Admin Update" ON public.asset_groups
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';