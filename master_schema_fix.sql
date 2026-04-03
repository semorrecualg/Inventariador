-- =============================================================================
-- SCRIPT DE PADRONIZAÇÃO GLOBAL V1.0 - DEFINITIVO
-- Objetivo: Unificar todos os campos de Tenant e Unidade em todas as tabelas.
-- Padronização: _tenantid e _unitid (Padrão de Auditoria do Sistema)
-- =============================================================================

DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- 1. REMOVER TODAS AS POLÍTICAS DE RLS ANTIGAS (Limpa dependências de colunas)
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('assets', 'inventory_campaigns', 'inventory_config', 'user_permissions', 'audit_logs')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;

    -- 2. PROCESSAR CADA TABELA PARA PADRONIZAÇÃO
    FOR r IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('assets', 'inventory_campaigns', 'inventory_config', 'user_permissions', 'audit_logs')
    ) LOOP
        -- A. Garantir que as colunas PADRÃO existam
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS _tenantid TEXT', r.table_name);
        
        IF r.table_name IN ('assets', 'inventory_campaigns') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS _unitid TEXT', r.table_name);
        END IF;

        -- B. Migrar dados de 'tenantid' ou 'tenant_id' para '_tenantid' e apagar legados
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'tenantid') THEN
            EXECUTE format('UPDATE public.%I SET _tenantid = tenantid WHERE _tenantid IS NULL', r.table_name);
            EXECUTE format('ALTER TABLE public.%I DROP COLUMN tenantid CASCADE', r.table_name);
        END IF;
        
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'tenant_id') THEN
            EXECUTE format('UPDATE public.%I SET _tenantid = tenant_id WHERE _tenantid IS NULL', r.table_name);
            EXECUTE format('ALTER TABLE public.%I DROP COLUMN tenant_id CASCADE', r.table_name);
        END IF;

        -- C. Migrar dados de 'unitid' ou 'unit_id' para '_unitid' e apagar legados
        IF r.table_name IN ('assets', 'inventory_campaigns') THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'unitid') THEN
                EXECUTE format('UPDATE public.%I SET _unitid = unitid WHERE _unitid IS NULL', r.table_name);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN unitid CASCADE', r.table_name);
            END IF;
            
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.table_name AND column_name = 'unit_id') THEN
                EXECUTE format('UPDATE public.%I SET _unitid = unit_id WHERE _unitid IS NULL', r.table_name);
                EXECUTE format('ALTER TABLE public.%I DROP COLUMN unit_id CASCADE', r.table_name);
            END IF;
        END IF;
    END LOOP;

    -- 3. CORREÇÃO DE SCHEMA: inventory_config (Adicionar colunas faltantes)
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS auto_confirm_on_scan BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS battery_saver BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS database_mode TEXT DEFAULT 'SUPABASE';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS editable_fields TEXT[] DEFAULT '{}';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS qr_code_fields TEXT[] DEFAULT '{}';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS scanner_mode TEXT DEFAULT 'CAMERA';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS scan_feedback_mode TEXT DEFAULT 'VIBRATE';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS inventory_search_mode TEXT DEFAULT 'LOCAL';
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS immersive_mode BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS protheus_integration_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS protheus_api_url TEXT;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS mandatory_photo_on_divergence BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS mandatory_photo_on_new_item BOOLEAN DEFAULT FALSE;

END $$;

-- 4. RECRIAÇÃO DAS POLÍTICAS DE RLS (Padrão Unificado)
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation: Assets" ON public.assets FOR ALL TO authenticated 
USING ((SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR _tenantid = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT _tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)));

ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation: Campaigns" ON public.inventory_campaigns FOR ALL TO authenticated 
USING ((SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR _tenantid = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT _tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)));

ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation: Config" ON public.inventory_config FOR ALL TO authenticated 
USING ((SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR _tenantid = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT _tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)));

-- 5. RECARREGAR SCHEMA
NOTIFY pgrst, 'reload schema';
