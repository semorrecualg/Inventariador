-- PARIDADE DE INDEXAÇÃO E RESILIÊNCIA GBR v24.50 (PostgreSQL / Supabase)
-- Este script garante a estrutura de dados necessária para o modo Cloud de alta performance.

-- 1. GARANTE COLUNAS DE CONTROLE (Caso o schema esteja defasado)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_conferido') THEN
        ALTER TABLE public.assets ADD COLUMN _conferido BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_plaquetado') THEN
        ALTER TABLE public.assets ADD COLUMN _plaquetado BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_is_deleted') THEN
        ALTER TABLE public.assets ADD COLUMN _is_deleted BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. GARANTE TABELAS DE LOGS (Caso o script de schema inicial não tenha rodado)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    details TEXT,
    tenant_id TEXT,
    origin TEXT
);

CREATE TABLE IF NOT EXISTS public.asset_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    tenant_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ÍNDICES ESSENCIAIS (Performance de Busca e Upsert em Lote)
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON public.assets("ETIQUETA");
CREATE INDEX IF NOT EXISTS idx_assets_status ON public.assets("STATUS");
CREATE INDEX IF NOT EXISTS idx_assets_endereco ON public.assets("ENDERECO");
CREATE INDEX IF NOT EXISTS idx_assets_tenantid ON public.assets("_tenantid");
CREATE INDEX IF NOT EXISTS idx_assets_unitid ON public.assets("_unitid");
CREATE INDEX IF NOT EXISTS idx_assets_conferido ON public.assets(_conferido);
CREATE INDEX IF NOT EXISTS idx_assets_is_deleted ON public.assets(_is_deleted) WHERE _is_deleted = true;

-- 4. ÍNDICE COMPOSTO (Otimização para Auditoria de Campo)
CREATE INDEX IF NOT EXISTS idx_assets_audit_search ON public.assets("_tenantid", "_unitid", "STATUS", "ETIQUETA");

-- 5. ÍNDICES DE LOGS (Histórico Rápido)
CREATE INDEX IF NOT EXISTS idx_asset_logs_asset_id ON public.asset_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);

-- 6. VERIFICAÇÃO DE SAÚDE (Query para rodar após aplicar)
/*
SELECT 
    schemaname, tablename, indexname, indexdef
FROM 
    pg_indexes 
WHERE 
    tablename = 'assets' 
    AND schemaname = 'public'
ORDER BY 
    indexname;
*/

-- 7. VALIDAÇÃO DE PERFORMANCE (Exemplo de uso)
-- EXPLAIN ANALYZE SELECT * FROM assets WHERE _tenantid = 'SEU_TENANT' AND "ETIQUETA" = '001234';
