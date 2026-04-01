
-- 1. Tabela de Categorias e Taxas de Depreciação
CREATE TABLE IF NOT EXISTS asset_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    account_code TEXT NOT NULL,
    annual_depreciation_rate DECIMAL(5,2) NOT NULL, -- Ex: 10.00 para 10% ao ano
    useful_life_months INTEGER NOT NULL, -- Ex: 120 para 10 anos
    _tenantid TEXT NOT NULL CHECK (_tenantid <> ''),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_code, _tenantid)
);

-- 2. Tabela de Movimentações de Ativos (Histórico de Auditoria Contábil)
CREATE TABLE IF NOT EXISTS asset_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL, -- Referência ao ID do ativo na tabela 'assets'
    type TEXT NOT NULL, -- 'TRANSFER', 'SALE', 'WRITE_OFF', 'ACQUISITION', 'REVALUATION'
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    from_cc TEXT, -- Centro de Custo Origem
    to_cc TEXT,   -- Centro de Custo Destino
    value DECIMAL(15,2), -- Valor da movimentação
    description TEXT,
    user_email TEXT,
    _tenantid TEXT NOT NULL CHECK (_tenantid <> ''),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Cálculo de Depreciação Mensal
CREATE TABLE IF NOT EXISTS asset_depreciation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id TEXT NOT NULL,
    period_month INTEGER NOT NULL, -- 1 a 12
    period_year INTEGER NOT NULL,
    depreciation_value DECIMAL(15,2) NOT NULL,
    accumulated_depreciation DECIMAL(15,2) NOT NULL,
    residual_value DECIMAL(15,2) NOT NULL,
    _tenantid TEXT NOT NULL CHECK (_tenantid <> ''),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(asset_id, period_month, period_year, _tenantid)
);

-- 4. Extensão da tabela assets para campos contábeis (se não existirem)
-- Nota: O upsert do app já lida com campos dinâmicos, mas aqui garantimos tipos para relatórios
ALTER TABLE assets ADD COLUMN IF NOT EXISTS _valor_residual DECIMAL(15,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS _depreciacao_acumulada DECIMAL(15,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS _data_inicio_depreciacao DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS _status_contabil TEXT DEFAULT 'ATIVO'; -- 'ATIVO', 'BAIXADO', 'VENDIDO'
ALTER TABLE assets ADD COLUMN IF NOT EXISTS _origemTransacao TEXT;

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_movements_asset ON asset_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_asset ON asset_depreciation_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON asset_categories(_tenantId);
