
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
    _tenantId TEXT NOT NULL,
    _lat DECIMAL(10,8),
    _lng DECIMAL(11,8),
    _aprovado BOOLEAN DEFAULT FALSE,
    _dataAprovacao TIMESTAMP WITH TIME ZONE,
    _aprovador TEXT,
    _assinatura TEXT,
    "DE_PARA" TEXT,
    "AUDITOR_STATUS_CONFERENCIA" TEXT,
    
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
    _tenantId TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Permissões de Usuário
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    "isAdmin" BOOLEAN DEFAULT FALSE,
    tenantId TEXT,
    username TEXT,
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
    _tenantId TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(code, _tenantId)
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
    _tenantId TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_code, _tenantId)
);

-- 6. Tabela de Classificador NCM
CREATE TABLE IF NOT EXISTS ncm_classifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ncm_code TEXT NOT NULL,
    description TEXT NOT NULL,
    group_code TEXT NOT NULL,
    annual_depreciation_rate DECIMAL(5,2) NOT NULL,
    useful_life_months INTEGER NOT NULL,
    _tenantId TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ncm_code, _tenantId)
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
    _tenantId TEXT NOT NULL,
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
    _tenantId TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(asset_id, period_month, period_year, _tenantId)
);

-- 9. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_assets_etiqueta ON assets("ETIQUETA");
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(_tenantId);
CREATE INDEX IF NOT EXISTS idx_config_tenant ON inventory_config(_tenantId);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON chart_of_accounts(code);
CREATE INDEX IF NOT EXISTS idx_groups_code ON asset_groups(group_code);
CREATE INDEX IF NOT EXISTS idx_ncm_code ON ncm_classifiers(ncm_code);
CREATE INDEX IF NOT EXISTS idx_movements_asset ON asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_asset ON asset_depreciation_history(asset_id);

-- 10. Políticas de RLS (Row Level Security) - Básico
-- Habilitar RLS em todas as tabelas
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncm_classifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciation_history ENABLE ROW LEVEL SECURITY;

-- Exemplo de política: Permitir tudo para usuários autenticados (ajustar conforme necessário)
-- CREATE POLICY "Permitir tudo para autenticados" ON assets FOR ALL USING (auth.role() = 'authenticated');
-- ... repetir para outras tabelas ...

-- Para simplificar o desenvolvimento inicial, você pode usar:
CREATE POLICY "Permitir acesso total" ON assets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON inventory_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON user_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON chart_of_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON asset_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON ncm_classifiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON asset_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total" ON asset_depreciation_history FOR ALL USING (true) WITH CHECK (true);
