
-- 1. Garantir que a tabela assets tenha a coluna _is_deleted
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS _is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS _tenantid TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS _unitid TEXT;

-- 2. Garantir que a tabela unit_configs exista no schema public
CREATE TABLE IF NOT EXISTS public.unit_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    lat DECIMAL(10,8),
    lng DECIMAL(11,8),
    radius_meters INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT,
    UNIQUE(tenant_id, unit_id)
);

-- 3. Garantir permissões explícitas para a tabela unit_configs
GRANT ALL ON public.unit_configs TO postgres;
GRANT ALL ON public.unit_configs TO authenticated;
GRANT ALL ON public.unit_configs TO service_role;
GRANT ALL ON public.unit_configs TO anon;

-- 4. Comentário para forçar atualização do cache do PostgREST
COMMENT ON TABLE public.unit_configs IS 'Configurações de Geofencing por Unidade (v2)';

-- 5. Notificar PostgREST para recarregar o esquema
NOTIFY pgrst, 'reload schema';

-- 6. Garantir que as políticas de RLS permitam acesso
ALTER TABLE public.unit_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura para usuários autenticados" ON public.unit_configs;
CREATE POLICY "Permitir leitura para usuários autenticados" 
ON public.unit_configs FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Permitir inserção/atualização para administradores" ON public.unit_configs;
CREATE POLICY "Permitir inserção/atualização para administradores" 
ON public.unit_configs FOR ALL 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 7. Verificar se a coluna _is_deleted foi realmente adicionada
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_is_deleted') THEN
        ALTER TABLE public.assets ADD COLUMN _is_deleted BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
