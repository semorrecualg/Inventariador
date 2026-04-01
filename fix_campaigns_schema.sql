
-- Garantir que a tabela inventory_campaigns exista e tenha permissões
CREATE TABLE IF NOT EXISTS public.inventory_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'ACTIVE',
    tenantid TEXT,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permissões
GRANT ALL ON public.inventory_campaigns TO postgres;
GRANT ALL ON public.inventory_campaigns TO authenticated;
GRANT ALL ON public.inventory_campaigns TO service_role;
GRANT ALL ON public.inventory_campaigns TO anon;

-- RLS
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo para usuários autenticados" ON public.inventory_campaigns;
CREATE POLICY "Permitir tudo para usuários autenticados" 
ON public.inventory_campaigns FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
