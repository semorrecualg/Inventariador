-- Script de Correção Definitiva V4: inventory_campaigns
-- Este script remove restrições de NOT NULL de colunas legadas e unifica o schema.

DO $$ 
BEGIN
    -- 1. Garantir que a tabela exista
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_campaigns') THEN
        CREATE TABLE public.inventory_campaigns (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'ACTIVE',
            start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            end_date TIMESTAMP WITH TIME ZONE,
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    END IF;

    -- 2. Adicionar/Corrigir colunas e remover NOT NULL de todas para evitar erro 23502
    -- Coluna: _tenantid (Padrão)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _tenantid TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN _tenantid DROP NOT NULL;
    END IF;

    -- Coluna: tenantid (Legado 1)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN tenantid TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN tenantid DROP NOT NULL;
    END IF;

    -- Coluna: tenant_id (Legado 2 - Snake Case causando erro 23502)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='tenant_id') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN tenant_id TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN tenant_id DROP NOT NULL;
    END IF;

    -- Repetir para Unit IDs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _unitid TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN _unitid DROP NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN unitid TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN unitid DROP NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='unit_id') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN unit_id TEXT;
    ELSE
        ALTER TABLE public.inventory_campaigns ALTER COLUMN unit_id DROP NOT NULL;
    END IF;

    -- 3. Sincronizar dados para a coluna padrão _tenantid
    UPDATE public.inventory_campaigns 
    SET _tenantid = COALESCE(_tenantid, tenantid, tenant_id),
        _unitid = COALESCE(_unitid, unitid, unit_id);

END $$;

-- 4. Permissões
GRANT ALL ON public.inventory_campaigns TO authenticated;
GRANT ALL ON public.inventory_campaigns TO service_role;

-- 5. RLS (Row Level Security) - Abrangente para todas as colunas possíveis
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant Isolation: Campaigns" ON public.inventory_campaigns;
CREATE POLICY "Tenant Isolation: Campaigns" ON public.inventory_campaigns 
FOR ALL TO authenticated 
USING (
    (SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR 
    _tenantid = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)) OR
    tenantid = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)) OR
    tenant_id = COALESCE((auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT, (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1))
);

-- 6. RECARREGAR SCHEMA
NOTIFY pgrst, 'reload schema';
