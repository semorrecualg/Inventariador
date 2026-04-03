-- Script de Unificação Final V4: inventory_campaigns
-- Este script usa blocos de exceção para garantir a conclusão mesmo com inconsistências de schema.

DO $$ 
BEGIN
    -- 1. REMOVER TODAS AS POLÍTICAS ANTIGAS (Limpa as dependências)
    BEGIN DROP POLICY IF EXISTS "Tenant Isolation: Campaigns" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DROP POLICY IF EXISTS "Campaigns: Read Access" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DROP POLICY IF EXISTS "Campaigns: Admin Write" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DROP POLICY IF EXISTS "Admin Manage: Campaigns" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 2. Garantir que as colunas PADRÃO existam (_tenantid, _unitid)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _tenantid TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _unitid TEXT;
    END IF;

    -- 3. Tentar Migrar e Apagar: tenantid
    BEGIN
        EXECUTE 'UPDATE public.inventory_campaigns SET _tenantid = COALESCE(_tenantid, tenantid)';
        EXECUTE 'ALTER TABLE public.inventory_campaigns DROP COLUMN tenantid';
    EXCEPTION WHEN OTHERS THEN 
        NULL;
    END;

    -- 4. Tentar Migrar e Apagar: tenant_id
    BEGIN
        EXECUTE 'UPDATE public.inventory_campaigns SET _tenantid = COALESCE(_tenantid, tenant_id)';
        EXECUTE 'ALTER TABLE public.inventory_campaigns DROP COLUMN tenant_id';
    EXCEPTION WHEN OTHERS THEN 
        NULL;
    END;

    -- 5. Tentar Migrar e Apagar: unitid
    BEGIN
        EXECUTE 'UPDATE public.inventory_campaigns SET _unitid = COALESCE(_unitid, unitid)';
        EXECUTE 'ALTER TABLE public.inventory_campaigns DROP COLUMN unitid';
    EXCEPTION WHEN OTHERS THEN 
        NULL;
    END;

    -- 6. Tentar Migrar e Apagar: unit_id
    BEGIN
        EXECUTE 'UPDATE public.inventory_campaigns SET _unitid = COALESCE(_unitid, unit_id)';
        EXECUTE 'ALTER TABLE public.inventory_campaigns DROP COLUMN unit_id';
    EXCEPTION WHEN OTHERS THEN 
        NULL;
    END;

END $$;

-- 7. CRIAR A NOVA POLÍTICA DEFINITIVA (Baseada apenas em _tenantid)
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation: Campaigns" ON public.inventory_campaigns;
CREATE POLICY "Tenant Isolation: Campaigns" ON public.inventory_campaigns 
FOR ALL TO authenticated 
USING (
    (SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR 
    _tenantid = COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
        (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
    )
);

-- 8. RECARREGAR SCHEMA
NOTIFY pgrst, 'reload schema';
