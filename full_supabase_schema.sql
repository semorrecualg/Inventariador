
-- 0. Ativar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Ativos (Assets)
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    GRUPO_EMPRESARIAL TEXT,
    UNIDADE_OPERACIONAL TEXT,
    STATUS TEXT,
    ETIQUETA TEXT,
    QT DECIMAL(15,2),
    DESCRICAODOATIVO TEXT,
    SERIAL TEXT,
    DATAAQUISIC DATE,
    CNPJ TEXT,
    NOMEFORNECEDOR TEXT,
    NOTAFISCAL TEXT,
    ENDERECO TEXT,
    REGISTRO TEXT,
    SUBREG TEXT,
    DATABAIXA DATE,
    CONTACONTABIL TEXT,
    PRIMARY KEY_TEXT TEXT, -- PRIMARYKEY is a reserved word in some contexts
    CENTRODECUSTO TEXT,
    VLRAQUISIC DECIMAL(15,2),
    Sn1_recno INTEGER,
    Sn3_recno INTEGER,
    
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
    _tenantid TEXT NOT NULL CHECK (_tenantid <> ''),
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
    _is_deleted BOOLEAN DEFAULT FALSE,
    
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

-- Trigger para Garantir Unificação de Campos (DBA Level Hard)
CREATE OR REPLACE FUNCTION unify_asset_fields() RETURNS TRIGGER AS $$
BEGIN
    -- Unifica Tenant ID
    IF NEW._tenantid IS NULL OR NEW._tenantid = '' THEN
        NEW._tenantid := COALESCE(NEW.GRUPO_EMPRESARIAL, '');
    END IF;
    
    -- Unifica Unit ID
    IF NEW._unitid IS NULL OR NEW._unitid = '' THEN
        NEW._unitid := COALESCE(NEW.UNIDADE_OPERACIONAL, '');
    END IF;
    
    -- Sincroniza campos legados para compatibilidade reversa
    IF NEW.UNIDADE_OPERACIONAL IS NULL OR NEW.UNIDADE_OPERACIONAL = '' THEN
        NEW.UNIDADE_OPERACIONAL := NEW._unitid;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unify_asset_fields ON assets;
CREATE TRIGGER trg_unify_asset_fields
BEFORE INSERT OR UPDATE ON assets
FOR EACH ROW EXECUTE FUNCTION unify_asset_fields();

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
    "databaseMode" TEXT DEFAULT 'HYBRID',
    _tenantid TEXT,
    _unitid TEXT, -- Unidade Operacional (opcional para config específica)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Configurações de Unidades (Geofencing)
CREATE TABLE IF NOT EXISTS unit_configs (
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

-- 3. Tabela de Permissões de Usuário
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT FALSE,
    tenantid TEXT, -- ID da Organização (ex: CICOPAL)
    unitid TEXT,   -- Unidade Operacional Padrão
    units TEXT[],  -- Lista de Unidades Operacionais autorizadas
    tenants TEXT[], -- Lista de Organizações autorizadas
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

-- 6. Tabela de Localidades (Legendas e Metadados)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- O nome do endereço/localidade (ex: MATRIZ)
    description TEXT,   -- A legenda/descrição (ex: Prédio Administrativo)
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    _tenantid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, _tenantid)
);

-- 7. Tabela de Classificador NCM
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

-- 9. Tabela de Logs de Auditoria (Sistema)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'BULK_UPDATE'
    table_name TEXT,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    details TEXT,
    tenant_id TEXT,
    origin TEXT -- 'INVENTORY', 'LABELING', 'ACCOUNT_RECONCILIATION'
);

-- 10. Tabela de Logs de Ativos (Histórico Específico)
CREATE TABLE IF NOT EXISTS asset_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'IMPAIRMENT_TEST'
    old_data JSONB,
    new_data JSONB,
    tenant_id TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Tabela de Campanhas de Inventário
CREATE TABLE IF NOT EXISTS inventory_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'CLOSED', 'ARCHIVED'
    tenant_id TEXT NOT NULL,
    created_by TEXT NOT NULL
);

-- 12. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets("ETIQUETA");
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets("STATUS");
CREATE INDEX IF NOT EXISTS idx_assets_endereco ON assets("ENDERECO");
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(_tenantid);
CREATE INDEX IF NOT EXISTS idx_assets_unitid ON assets(_unitid);
CREATE INDEX IF NOT EXISTS idx_assets_conferido ON assets(_conferido);
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
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_campaigns ENABLE ROW LEVEL SECURITY;

-- Funções Auxiliares para RLS
CREATE OR REPLACE FUNCTION get_auth_tenant() RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'tenantid')::TEXT,
    (SELECT tenantid FROM user_permissions WHERE id = auth.uid() LIMIT 1)
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT 
    (auth.jwt() -> 'user_metadata' ->> 'role')::TEXT IN ('ADMIN', 'MASTER') OR
    (auth.jwt() ->> 'email')::TEXT = 'semorr@gmail.com' OR
    EXISTS (SELECT 1 FROM user_permissions WHERE id = auth.uid() AND (role IN ('ADMIN', 'MASTER') OR is_admin = true));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION is_master() RETURNS BOOLEAN AS $$
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role')::TEXT = 'MASTER';
$$ LANGUAGE sql STABLE;

-- Políticas para ASSETS
DROP POLICY IF EXISTS "Permitir acesso total" ON assets;
CREATE POLICY "Tenant Isolation: Assets" ON assets 
FOR ALL TO authenticated 
USING (is_master() OR _tenantid = get_auth_tenant())
WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

-- Políticas para INVENTORY_CONFIG
DROP POLICY IF EXISTS "Permitir acesso total" ON inventory_config;
CREATE POLICY "Tenant Isolation: Config" ON inventory_config 
FOR ALL TO authenticated 
USING (is_master() OR _tenantid = get_auth_tenant() OR id = 'global_config')
WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

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
CREATE POLICY "Tenant Isolation: Accounts" ON chart_of_accounts FOR ALL TO authenticated USING (is_master() OR _tenantid = get_auth_tenant()) WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_groups;
CREATE POLICY "Tenant Isolation: Groups" ON asset_groups FOR ALL TO authenticated USING (is_master() OR _tenantid = get_auth_tenant()) WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON ncm_classifiers;
CREATE POLICY "Tenant Isolation: NCM" ON ncm_classifiers FOR ALL TO authenticated USING (is_master() OR _tenantid = get_auth_tenant()) WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_movements;
CREATE POLICY "Tenant Isolation: Movements" ON asset_movements FOR ALL TO authenticated USING (is_master() OR _tenantid = get_auth_tenant()) WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

DROP POLICY IF EXISTS "Permitir acesso total" ON asset_depreciation_history;
CREATE POLICY "Tenant Isolation: Depreciation" ON asset_depreciation_history FOR ALL TO authenticated USING (is_master() OR _tenantid = get_auth_tenant()) WITH CHECK (is_master() OR _tenantid = get_auth_tenant());

-- Políticas para AUDIT_LOGS
CREATE POLICY "Tenant Isolation: Audit Logs" ON audit_logs 
FOR SELECT TO authenticated 
USING (is_master() OR tenant_id = get_auth_tenant() OR (user_email = auth.jwt() ->> 'email'));

CREATE POLICY "System Insert: Audit Logs" ON audit_logs 
FOR INSERT TO authenticated 
WITH CHECK (is_master() OR tenant_id = get_auth_tenant() OR tenant_id IS NULL);

-- Políticas para ASSET_LOGS
CREATE POLICY "Tenant Isolation: Asset Logs" ON asset_logs 
FOR SELECT TO authenticated 
USING (is_master() OR tenant_id = get_auth_tenant());

CREATE POLICY "System Insert: Asset Logs" ON asset_logs 
FOR INSERT TO authenticated 
WITH CHECK (is_master() OR tenant_id = get_auth_tenant());

-- Políticas para INVENTORY_CAMPAIGNS
CREATE POLICY "Tenant Isolation: Campaigns" ON inventory_campaigns 
FOR SELECT TO authenticated 
USING (is_master() OR tenant_id = get_auth_tenant());

CREATE POLICY "Admin Manage: Campaigns" ON inventory_campaigns 
FOR ALL TO authenticated 
USING (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()))
WITH CHECK (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()));

-- Políticas para UNIT_CONFIGS
ALTER TABLE unit_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Isolation: Unit Configs" ON unit_configs;
CREATE POLICY "Tenant Isolation: Unit Configs" ON unit_configs 
FOR ALL TO authenticated 
USING (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()))
WITH CHECK (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()));

DROP POLICY IF EXISTS "Auditor Read: Unit Configs" ON unit_configs;
CREATE POLICY "Auditor Read: Unit Configs" ON unit_configs 
FOR SELECT TO authenticated 
USING (is_master() OR tenant_id = get_auth_tenant());

-- ==========================================
-- POLÍTICAS DE STORAGE (ASSET PHOTOS)
-- ==========================================

-- 0. Criar Bucket (Se não existir)
-- Nota: Buckets geralmente são criados via Console ou API de Admin
-- Mas incluímos aqui para referência de configuração
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('asset-photos', 'asset-photos', true)
-- ON CONFLICT (id) DO NOTHING;

-- Nota: Estas políticas aplicam-se ao bucket 'asset-photos'
-- O caminho esperado é: photos/{tenantid}/{assetId}/{filename}

-- 1. Permitir Upload (Apenas usuários autenticados no seu próprio tenant ou MASTER)
-- Supabase Storage usa a tabela storage.objects
CREATE POLICY "Authenticated Upload: Asset Photos" ON storage.objects 
FOR INSERT TO authenticated 
WITH CHECK (
    bucket_id = 'asset-photos' 
    AND (storage.foldername(name))[1] = 'photos'
    AND (is_master() OR (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantid'))
);

-- 2. Permitir Leitura (Usuários do mesmo tenant ou MASTER)
CREATE POLICY "Tenant Read: Asset Photos" ON storage.objects 
FOR SELECT TO authenticated 
USING (
    bucket_id = 'asset-photos' 
    AND (is_master() OR (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantid'))
);

-- 3. Permitir Deleção (Admins do tenant ou MASTER)
CREATE POLICY "Admin Delete: Asset Photos" ON storage.objects 
FOR DELETE TO authenticated 
USING (
    bucket_id = 'asset-photos' 
    AND (
        is_master() 
        OR (
            (storage.foldername(name))[2] = ((auth.jwt() -> 'user_metadata') ->> 'tenantid')
            AND ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'MASTER')
        )
    )
);
