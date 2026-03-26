
-- 0. Ativar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Ativos (Assets)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "EMPRESA" TEXT,
    "STATUS" TEXT,
    "ETIQUETA" TEXT,
    "QT" DECIMAL(15,2),
    "DESCRICAODOATIVO" TEXT,
    "SERIAL" TEXT,
    "DATAAQUSIC" DATE,
    "CNPJ" TEXT,
    "NOMEFORNECEDOR" TEXT,
    "NOTAFISCAL" TEXT,
    "ENDERECO" TEXT,
    "REGISTRO" TEXT,
    "SUBREG" TEXT,
    "DATABAIXA" DATE,
    "CONTACONTABIL" TEXT,
    "PRIMARYKEY" TEXT,
    "CENTRODECUSTO" TEXT,
    "VLRAQUISIC" DECIMAL(15,2),
    "Sn1_recno" INTEGER,
    "Sn3_recno" INTEGER,
    
    -- Campos de Controle Interno
    _conferido BOOLEAN DEFAULT FALSE,
    _plaquetado BOOLEAN DEFAULT FALSE,
    _plaquetaMaster TEXT,
    _localMaster TEXT,
    _empresaNormalizada TEXT,
    _descricaoMaster TEXT,
    _baseSinteticaLoc TEXT[],
    _camposAlterados TEXT[],
    _valoresOriginais JSONB,
    
    -- Tags de Auditoria
    "TAG_DUPLICIDADE" TEXT,
    "TAG_INVENTARIO" TEXT,
    "ESTADO_CONSERVACAO" TEXT,
    _isNew BOOLEAN DEFAULT FALSE,
    _dataLeitura TIMESTAMP WITH TIME ZONE,
    _auditor TEXT,
    _history JSONB,
    _photoUrl TEXT,
    _tenantid TEXT NOT NULL,
    _unitid TEXT, -- Unidade Operacional
    _lat DECIMAL(10,8),
    _lng DECIMAL(11,8),
    _aprovado BOOLEAN DEFAULT FALSE,
    _dataAprovacao TIMESTAMP WITH TIME ZONE,
    _aprovador TEXT,
    _assinatura TEXT,
    "DE_PARA" TEXT,
    "AUDITOR_STATUS_CONFERENCIA" TEXT,
    _origemTransacao TEXT,
    
    -- Novos Campos Módulo Controle de Ativo (Contábil)
    _valor_aquisicao DECIMAL(15,2),
    _valor_residual DECIMAL(15,2),
    _depreciacao_acumulada DECIMAL(15,2),
    _data_aquisicao DATE,
    _data_inicio_depreciacao DATE,
    _vida_util_meses INTEGER,
    _taxa_depreciacao_anual DECIMAL(5,2),
    _status_contabil TEXT DEFAULT 'ATIVO',
    _conta_contabil TEXT,
    _centro_custo TEXT,
    _ncm_code TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Configuração do Inventário
CREATE TABLE IF NOT EXISTS inventory_config (
    id TEXT PRIMARY KEY, -- 'global_config' ou 'config_{tenantId}'
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
    _tenantid TEXT,
    _unitid TEXT, -- Unidade Operacional (opcional para config específica)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Permissões de Usuário
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    "isAdmin" BOOLEAN DEFAULT FALSE,
    tenantid TEXT, -- ID da Organização (ex: CICOPAL)
    unitid TEXT,   -- Unidade Operacional Padrão
    units TEXT[],  -- Lista de Unidades Operacionais autorizadas
    tenants TEXT[], -- Mantido para compatibilidade
    username TEXT,
    name TEXT,     -- Nome Completo
    role TEXT DEFAULT 'AUDITOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Plano de Contas
CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type CHAR(1) NOT NULL, -- 'S' ou 'A'
    level INTEGER NOT NULL,
    parent_code TEXT,
    nature CHAR(1) NOT NULL, -- 'D' ou 'C'
    classification TEXT NOT NULL, -- 'ATIVO', 'PASSIVO', etc.
    referential_code TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(code, _tenantid)
);

-- 5. Tabela de Grupos Contábeis (Bens)
CREATE TABLE IF NOT EXISTS asset_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_code TEXT NOT NULL,
    name TEXT NOT NULL,
    asset_account TEXT NOT NULL,
    accumulated_depreciation_account TEXT NOT NULL,
    depreciation_expense_account TEXT NOT NULL,
    annual_depreciation_rate DECIMAL(5,2) NOT NULL,
    depreciation_method TEXT NOT NULL,
    useful_life_months INTEGER NOT NULL,
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_code, _tenantid)
);

-- 6. Tabela de Classificador NCM
CREATE TABLE IF NOT EXISTS ncm_classifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ncm_code TEXT NOT NULL,
    description TEXT NOT NULL,
    group_code TEXT NOT NULL,
    annual_depreciation_rate DECIMAL(5,2) NOT NULL,
    useful_life_months INTEGER NOT NULL,
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ncm_code, _tenantid)
);

-- 7. Tabela de Movimentações de Ativos
CREATE TABLE IF NOT EXISTS asset_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'TRANSFER', 'SALE', 'WRITE_OFF', 'ACQUISITION', 'REVALUATION'
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    from_cc TEXT,
    to_cc TEXT,
    value DECIMAL(15,2),
    description TEXT,
    user_email TEXT,
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Tabela de Histórico de Depreciação
CREATE TABLE IF NOT EXISTS asset_depreciation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    period_month INTEGER NOT NULL,
    period_year INTEGER NOT NULL,
    depreciation_value DECIMAL(15,2) NOT NULL,
    accumulated_depreciation DECIMAL(15,2) NOT NULL,
    residual_value DECIMAL(15,2) NOT NULL,
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(asset_id, period_month, period_year, _tenantid)
);

-- 9. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets("ETIQUETA");
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(_tenantid);
CREATE INDEX IF NOT EXISTS idx_config_tenant ON inventory_config(_tenantid);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_groups_code ON asset_groups(group_code);
CREATE INDEX IF NOT EXISTS idx_ncm_code ON ncm_classifiers(ncm_code);
CREATE INDEX IF NOT EXISTS idx_movements_asset ON asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_asset ON asset_depreciation_history(asset_id);

-- 10. Políticas de RLS (Row Level Security) - Blindagem Técnica GBR v24.50
-- Habilitar RLS em todas as tabelas
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncm_classifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciation_history ENABLE ROW LEVEL SECURITY;

-- Funções Auxiliares para RLS
CREATE OR REPLACE FUNCTION get_auth_tenant() RETURNS TEXT AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role')::TEXT IN ('ADMIN', 'MASTER');
$$ LANGUAGE sql STABLE;

-- Políticas para ASSETS
DROP POLICY IF EXISTS "Permitir acesso total" ON assets;
CREATE POLICY "Tenant Isolation: Assets" ON assets 
FOR ALL TO authenticated 
USING (_tenantid = get_auth_tenant())
WITH CHECK (_tenantid = get_auth_tenant());

-- Políticas para INVENTORY_CONFIG
DROP POLICY IF EXISTS "Permitir acesso total" ON inventory_config;
CREATE POLICY "Tenant Isolation: Config" ON inventory_config 
FOR ALL TO authenticated 
USING (_tenantid = get_auth_tenant() OR id = 'global_config')
WITH CHECK (_tenantid = get_auth_tenant());

-- Políticas para USER_PERMISSIONS
DROP POLICY IF EXISTS "Permitir acesso total" ON user_permissions;
CREATE POLICY "Self Read: Permissions" ON user_permissions 
FOR SELECT TO authenticated 
USING (id = auth.uid() OR (tenantid = get_auth_tenant() AND is_admin()));

CREATE POLICY "Admin Manage: Permissions" ON user_permissions 
FOR ALL TO authenticated 
USING (tenantid = get_auth_tenant() AND is_admin())
WITH CHECK (tenantid = get_auth_tenant() AND is_admin());

-- Políticas para Tabelas Contábeis (Tenant Isolation)
DROP POLICY IF EXISTS "Permitir acesso total" ON chart_of_accounts;
CREATE POLICY "Tenant Isolation: Accounts" ON chart_of_accounts FOR ALL TO authenticated USING (_tenantid = get_auth_tenant()) WITH CHECK (_tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_groups;
CREATE POLICY "Tenant Isolation: Groups" ON asset_groups FOR ALL TO authenticated USING (_tenantid = get_auth_tenant()) WITH CHECK (_tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON ncm_classifiers;
CREATE POLICY "Tenant Isolation: NCM" ON ncm_classifiers FOR ALL TO authenticated USING (_tenantid = get_auth_tenant()) WITH CHECK (_tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_movements;
CREATE POLICY "Tenant Isolation: Movements" ON asset_movements FOR ALL TO authenticated USING (_tenantid = get_auth_tenant()) WITH CHECK (_tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_depreciation_history;
CREATE POLICY "Tenant Isolation: Depreciation" ON asset_depreciation_history FOR ALL TO authenticated USING (_tenantid = get_auth_tenant()) WITH CHECK (_tenantid = get_auth_tenant());

-- ==========================================
-- POLÍTICAS DE STORAGE (ASSET PHOTOS)
-- ==========================================

-- Nota: Estas políticas aplicam-se ao bucket 'asset-photos'
-- O caminho esperado é: photos/{tenantId}/{assetId}/{filename}

-- 1. Permitir Upload (Apenas usuários autenticados no seu próprio tenant)
-- Supabase Storage usa a tabela storage.objects
CREATE POLICY "Authenticated Upload: Asset Photos" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (
    bucket_id = 'asset-photos' 
    AND (storage.foldername(name))[1] = 'photos'
    AND (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantId')
);

-- 2. Permitir Leitura (Usuários do mesmo tenant)
CREATE POLICY "Tenant Read: Asset Photos" ON storage.objects 
FOR SELECT TO authenticated 
USING (
    bucket_id = 'asset-photos' 
    AND (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantId')
);

-- 3. Permitir Deleção (Admins do tenant)
CREATE POLICY "Admin Delete: Asset Photos" ON storage.objects 
FOR DELETE TO authenticated 
USING (
    bucket_id = 'asset-photos' 
    AND (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantId')
    AND ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'MASTER')
);
