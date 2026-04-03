-- Script de Emergência V5: inventory_campaigns
-- Foco total em remover restrições NOT NULL que causam erro 23502.

DO $$ 
DECLARE
    col_rec RECORD;
BEGIN
    -- 1. REMOVER TODAS AS POLÍTICAS ANTIGAS PARA LIMPAR DEPENDÊNCIAS
    BEGIN DROP POLICY IF EXISTS "Tenant Isolation: Campaigns" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DROP POLICY IF EXISTS "Campaigns: Read Access" ON public.inventory_campaigns; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 2. LOCALIZAR E REMOVER 'NOT NULL' DE TODAS AS COLUNAS DE TENANT/UNIT
    FOR col_rec IN 
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'inventory_campaigns' 
        AND column_name IN ('tenantid', 'tenant_id', '_tenantid', 'unitid', 'unit_id', '_unitid')
    LOOP
        EXECUTE format('ALTER TABLE public.inventory_campaigns ALTER COLUMN %I DROP NOT NULL', col_rec.column_name);
    END LOOP;

    -- 3. Garantir que as colunas padrão existam
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _tenantid TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _unitid TEXT;
    END IF;

    -- 4. Migrar dados de forma segura
    BEGIN EXECUTE 'UPDATE public.inventory_campaigns SET _tenantid = tenantid WHERE _tenantid IS NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN EXECUTE 'UPDATE public.inventory_campaigns SET _tenantid = tenant_id WHERE _tenantid IS NULL'; EXCEPTION WHEN OTHERS THEN NULL; END;

    -- 5. Recriar a política de segurança definitiva
    ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Tenant Isolation: Campaigns" ON public.inventory_campaigns 
    FOR ALL TO authenticated 
    USING (
        (SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR 
        _tenantid = COALESCE(
            (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
            (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
        )
    );

END $$;

-- 6. RECARREGAR SCHEMA
NOTIFY pgrst, 'reload schema';
