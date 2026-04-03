-- Script de Correção Definitiva: inventory_campaigns
-- Este script resolve o erro de coluna "_tenantid" inexistente e padroniza o schema.

DO $$ 
BEGIN
    -- 1. Garantir que a tabela exista
    CREATE TABLE IF NOT EXISTS public.inventory_campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'ACTIVE',
        start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        end_date TIMESTAMP WITH TIME ZONE,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- 2. Adicionar colunas novas se não existirem
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _tenantid TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _unitid TEXT;
    END IF;

    -- 3. Migrar dados de colunas antigas para as novas (se existirem)
    
    -- Migrar tenantid -> _tenantid
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='tenantid') THEN
        UPDATE public.inventory_campaigns SET _tenantid = tenantid WHERE _tenantid IS NULL;
        -- Opcional: ALTER TABLE public.inventory_campaigns DROP COLUMN tenantid;
    END IF;

    -- Migrar tenant_id -> _tenantid
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='tenant_id') THEN
        UPDATE public.inventory_campaigns SET _tenantid = tenant_id WHERE _tenantid IS NULL;
        -- Opcional: ALTER TABLE public.inventory_campaigns DROP COLUMN tenant_id;
    END IF;

    -- Migrar unit_id -> _unitid
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='unit_id') THEN
        UPDATE public.inventory_campaigns SET _unitid = unit_id WHERE _unitid IS NULL;
        -- Opcional: ALTER TABLE public.inventory_campaigns DROP COLUMN unit_id;
    END IF;

END $$;

-- 4. Permissões
GRANT ALL ON public.inventory_campaigns TO postgres;
GRANT ALL ON public.inventory_campaigns TO authenticated;
GRANT ALL ON public.inventory_campaigns TO service_role;
GRANT ALL ON public.inventory_campaigns TO anon;

-- 5. RLS (Row Level Security)
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
)
WITH CHECK (
    (SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR 
    _tenantid = COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
        (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
    )
);

-- 6. Recarregar Schema do PostgREST
NOTIFY pgrst, 'reload schema';
