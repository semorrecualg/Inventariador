-- Script de Correção Definitiva V3: inventory_campaigns
-- Este script força a criação das colunas necessárias e limpa o cache do PostgREST.

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

    -- 2. Adicionar colunas de tenant/unit com múltiplos nomes para compatibilidade
    -- O sistema prefere o prefixo "_"
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _tenantid TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='_unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN _unitid TEXT;
    END IF;

    -- Adicionar também sem prefixo para garantir que o fallback do código funcione se o cache falhar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='tenantid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN tenantid TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_campaigns' AND column_name='unitid') THEN
        ALTER TABLE public.inventory_campaigns ADD COLUMN unitid TEXT;
    END IF;

    -- 3. Sincronizar dados entre as colunas
    UPDATE public.inventory_campaigns 
    SET _tenantid = COALESCE(_tenantid, tenantid),
        tenantid = COALESCE(tenantid, _tenantid);

END $$;

-- 4. Permissões Amplas
GRANT ALL ON public.inventory_campaigns TO postgres;
GRANT ALL ON public.inventory_campaigns TO authenticated;
GRANT ALL ON public.inventory_campaigns TO service_role;
GRANT ALL ON public.inventory_campaigns TO anon;

-- 5. RLS (Row Level Security) - Simplificado para garantir acesso inicial
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation: Campaigns" ON public.inventory_campaigns;
CREATE POLICY "Tenant Isolation: Campaigns" ON public.inventory_campaigns 
FOR ALL TO authenticated 
USING (
    (SELECT (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com') OR 
    _tenantid = COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
        (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
    ) OR
    tenantid = COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
        (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
    )
);

-- 6. RECARREGAR SCHEMA (Obrigatório para resolver PGRST204)
NOTIFY pgrst, 'reload schema';
