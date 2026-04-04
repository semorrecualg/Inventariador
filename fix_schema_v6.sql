-- SCRIPT DE UNIFICAÇÃO FINAL V6: PADRONIZAÇÃO TOTAL _tenantid / _unitid
-- Este script é extremamente resiliente e não falha se colunas estiverem ausentes.

DO $$ 
DECLARE
    t_name TEXT;
BEGIN
    -- 1. LISTA DE TABELAS PARA PADRONIZAR
    FOR t_name IN SELECT table_name FROM information_schema.tables 
                  WHERE table_schema = 'public' 
                  AND table_name IN ('assets', 'inventory_campaigns', 'inventory_items', 'unit_configs', 'user_permissions', 'audit_logs', 'asset_logs')
    LOOP
        -- A. Garantir _tenantid
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='_tenantid') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN _tenantid TEXT', t_name);
        END IF;

        -- B. Garantir _unitid
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='_unitid') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN _unitid TEXT', t_name);
        END IF;

        -- C. Migração Resiliente de _tenantid
        -- Tenta migrar de GRUPO_EMPRESARIAL
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='GRUPO_EMPRESARIAL') THEN
            EXECUTE format('UPDATE public.%I SET _tenantid = COALESCE(_tenantid, "GRUPO_EMPRESARIAL") WHERE _tenantid IS NULL', t_name);
        END IF;
        
        -- Tenta migrar de tenantid
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='tenantid') THEN
            EXECUTE format('UPDATE public.%I SET _tenantid = COALESCE(_tenantid, tenantid) WHERE _tenantid IS NULL', t_name);
        END IF;

        -- Tenta migrar de tenant_id
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='tenant_id') THEN
            EXECUTE format('UPDATE public.%I SET _tenantid = COALESCE(_tenantid, tenant_id) WHERE _tenantid IS NULL', t_name);
        END IF;

        -- D. Migração Resiliente de _unitid
        -- Tenta migrar de UNIDADE_OPERACIONAL
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='UNIDADE_OPERACIONAL') THEN
            EXECUTE format('UPDATE public.%I SET _unitid = COALESCE(_unitid, "UNIDADE_OPERACIONAL") WHERE _unitid IS NULL', t_name);
        END IF;

        -- Tenta migrar de unitid
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='unitid') THEN
            EXECUTE format('UPDATE public.%I SET _unitid = COALESCE(_unitid, unitid) WHERE _unitid IS NULL', t_name);
        END IF;

        -- Tenta migrar de unit_id
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t_name AND column_name='unit_id') THEN
            EXECUTE format('UPDATE public.%I SET _unitid = COALESCE(_unitid, unit_id) WHERE _unitid IS NULL', t_name);
        END IF;

        -- E. Fallback para CICOPAL / MATRIZ se ainda estiver nulo
        EXECUTE format('UPDATE public.%I SET _tenantid = ''CICOPAL'' WHERE _tenantid IS NULL', t_name);
        EXECUTE format('UPDATE public.%I SET _unitid = ''MATRIZ'' WHERE _unitid IS NULL', t_name);
        
    END LOOP;
END $$;

-- 2. RESET DE POLÍTICAS (RLS) PARA ASSETS E CAMPAIGNS
ALTER TABLE public.assets DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master Access: Assets" ON public.assets;
CREATE POLICY "Master Access: Assets" ON public.assets 
FOR ALL TO authenticated 
USING (
    (auth.jwt() ->> 'email' = 'semorr@gmail.com') OR 
    (_tenantid = (auth.jwt() -> 'user_metadata' ->> 'tenantid')) OR
    (_tenantid = (SELECT _tenantid FROM public.user_permissions WHERE id = auth.uid() LIMIT 1))
);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_campaigns DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Master Access: Campaigns" ON public.inventory_campaigns;
CREATE POLICY "Master Access: Campaigns" ON public.inventory_campaigns 
FOR ALL TO authenticated 
USING (
    (auth.jwt() ->> 'email' = 'semorr@gmail.com') OR 
    (_tenantid = (auth.jwt() -> 'user_metadata' ->> 'tenantid')) OR
    (_tenantid = (SELECT _tenantid FROM public.user_permissions WHERE id = auth.uid() LIMIT 1))
);
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;

-- 3. RECARREGAR CACHE DA API
NOTIFY pgrst, 'reload schema';

-- 4. VERIFICAÇÃO FINAL
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE column_name IN ('_tenantid', '_unitid') 
AND table_name IN ('assets', 'user_permissions', 'inventory_campaigns');
