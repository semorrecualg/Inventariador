-- ==========================================
-- GBR INVENTÁRIO - SCHEMA COMPLETO SUPABASE
-- Versão: v24.50 (FINAL - CORRECÇÃO DE ERRO SQL)
-- ==========================================

-- 0. Garantir Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Ativos (Assets)
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "GRUPO_EMPRESARIAL" TEXT,
    "UNIDADE_OPERACIONAL" TEXT,
    "STATUS" TEXT,
    "ETIQUETA" TEXT,
    "QT" DECIMAL(15,2),
    "DESCRICAODOATIVO" TEXT,
    "SERIAL" TEXT,
    "DATAAQUISIC" DATE,
    "CNPJ" TEXT,
    "NOMEFORNECEDOR" TEXT,
    "NOTAFISCAL" TEXT,
    "ENDERECO" TEXT,
    "REGISTRO" TEXT,
    "SUBREG" TEXT,
    "DATABAIXA" DATE,
    "CONTACONTABIL" TEXT,
    "PRIMARY KEY_TEXT" TEXT,
    "CENTRODECUSTO" TEXT,
    "VLRAQUISIC" DECIMAL(15,2),
    "Sn1_recno" INTEGER,
    "Sn3_recno" INTEGER,
    
    -- Campos de Controle Interno e Unitização
    "_is_unitized" BOOLEAN DEFAULT FALSE,
    "_parent_id" TEXT, -- ID do Ativo Pai
    "_plaquetaMaster" TEXT,
    "_localMaster" TEXT,
    "_conferido" BOOLEAN DEFAULT FALSE,
    "_plaquetado" BOOLEAN DEFAULT FALSE,
    "_empresaNormalizada" TEXT,
    "_descricaoMaster" TEXT,
    "_baseSinteticaLoc" TEXT[],
    "_camposAlterados" TEXT[],
    "_valoresOriginais" JSONB,
    
    -- Auditoria e Sync
    "TAG_DUPLICIDADE" TEXT,
    "TAG_INVENTARIO" TEXT,
    "ESTADO_CONSERVACAO" TEXT,
    "_isNew" BOOLEAN DEFAULT FALSE,
    "_dataLeitura" TIMESTAMP WITH TIME ZONE,
    "_auditor" TEXT,
    "_history" JSONB,
    "_photoUrl" TEXT,
    "_tenantid" TEXT NOT NULL DEFAULT 'GERAL',
    "_unitid" TEXT,
    "_lat" DECIMAL(10,8),
    "_lng" DECIMAL(11,8),
    "_aprovado" BOOLEAN DEFAULT FALSE,
    "_dataAprovacao" TIMESTAMP WITH TIME ZONE,
    "_aprovador" TEXT,
    "_assinatura" TEXT,
    "DE_PARA" TEXT,
    "AUDITOR_STATUS_CONFERENCIA" TEXT,
    "_origemTransacao" TEXT,
    "_is_deleted" BOOLEAN DEFAULT FALSE,
    "_campaignId" UUID, -- Relacionamento com Campanhas
    
    -- Campos Contábeis (Módulo de Controle)
    "_valor_aquisicao" DECIMAL(15,2),
    "_valor_residual" DECIMAL(15,2),
    "_depreciacao_acumulada" DECIMAL(15,2),
    "_data_aquisicao" DATE,
    "_data_inicio_depreciacao" DATE,
    "_vida_util_meses" INTEGER,
    "_taxa_depreciacao_anual" DECIMAL(5,2),
    "_status_contabil" TEXT DEFAULT 'ATIVO',
    "_conta_contabil" TEXT,
    "_centro_custo" TEXT,
    "_ncm_code" TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Configurações
CREATE TABLE IF NOT EXISTS public.inventory_config (
    id TEXT PRIMARY KEY,
    companies TEXT[],
    "lastUpdated" TIMESTAMP WITH TIME ZONE,
    status TEXT,
    "editableFields" TEXT[],
    "qrCodeFields" TEXT[],
    "scannerMode" TEXT,
    "autoConfirmOnScan" BOOLEAN,
    "scanFeedbackMode" TEXT,
    "inventorySearchMode" TEXT,
    "immersiveMode" BOOLEAN,
    "darkMode" BOOLEAN,
    "batterySaver" BOOLEAN,
    "protheusIntegrationEnabled" BOOLEAN,
    "protheusApiUrl" TEXT,
    "mandatoryPhotoOnDivergence" BOOLEAN,
    "mandatoryPhotoOnNewItem" BOOLEAN,
    "databaseMode" TEXT DEFAULT 'HYBRID',
    _tenantid TEXT,
    _unitid TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Campanhas
CREATE TABLE IF NOT EXISTS public.inventory_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'ACTIVE',
    tenant_id TEXT NOT NULL,
    _tenantid TEXT, -- Campo duplicado para compatibilidade com RLS legada
    _unitid TEXT,   -- Campo para filtro por unidade
    created_by TEXT,
    closure_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_email TEXT,
    action TEXT,
    table_name TEXT,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    details TEXT,
    tenant_id TEXT,
    _tenantid TEXT,
    origin TEXT
);

-- 5. Tabelas de Controle Contábil (Se houver erro de permissão no dashboard)
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

CREATE TABLE IF NOT EXISTS public.user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    tenantid TEXT,
    unitid TEXT,
    units TEXT[],
    tenants TEXT[],
    role TEXT DEFAULT 'AUDITOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON public.assets ("ETIQUETA");
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON public.assets (_tenantid);
CREATE INDEX IF NOT EXISTS idx_assets_campaign ON public.assets ("_campaignId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs (tenant_id);

-- 7. Ativar RLS (Row Level Security)
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- 8. Funções Auxiliares para RLS
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_permissions 
    WHERE id = auth.uid() AND (is_admin = TRUE OR role = 'ADMIN')
  ) OR (auth.jwt() ->> 'email') = 'semorr@gmail.com';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Políticas Básicas
-- Nota: Estas políticas permitem acesso se o usuário for ADMIN ou o tenantID bater
DROP POLICY IF EXISTS "Tenant Isolation" ON public.assets;
CREATE POLICY "Tenant Isolation" ON public.assets
    FOR ALL TO authenticated
    USING (
        _tenantid = (auth.jwt() -> 'user_metadata' ->> 'tenantid') 
        OR (auth.jwt() ->> 'email') = 'semorr@gmail.com'
    );

DROP POLICY IF EXISTS "Tenant Isolation Config" ON public.inventory_config;
CREATE POLICY "Tenant Isolation Config" ON public.inventory_config
    FOR ALL TO authenticated
    USING (
        _tenantid = (auth.jwt() -> 'user_metadata' ->> 'tenantid')
        OR id = 'global_config'
        OR (auth.jwt() ->> 'email') = 'semorr@gmail.com'
    );

DROP POLICY IF EXISTS "Tenant Isolation Campaigns" ON public.inventory_campaigns;
CREATE POLICY "Tenant Isolation Campaigns" ON public.inventory_campaigns
    FOR ALL TO authenticated
    USING (
        tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenantid')
        OR (auth.jwt() ->> 'email') = 'semorr@gmail.com'
    );

-- FIM DO SCRIPT
