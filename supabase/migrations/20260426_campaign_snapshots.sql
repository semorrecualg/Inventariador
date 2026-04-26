
-- Tabela de Snapshots de Campanha (Congelamento de Dados)
CREATE TABLE IF NOT EXISTS inventory_campaign_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES inventory_campaigns(id) ON DELETE CASCADE,
    assets_data JSONB NOT NULL, -- Snapshot completo dos ativos no momento do fechamento
    metadata JSONB, -- Estatísticas, observações técnicas
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_by TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para Performance
CREATE INDEX IF NOT EXISTS idx_snapshots_campaign ON inventory_campaign_snapshots(campaign_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_tenant ON inventory_campaign_snapshots(tenant_id);

-- RLS
ALTER TABLE inventory_campaign_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant Isolation: Snapshots" ON inventory_campaign_snapshots 
FOR SELECT TO authenticated 
USING (is_master() OR tenant_id = get_auth_tenant());

CREATE POLICY "Admin Manage: Snapshots" ON inventory_campaign_snapshots 
FOR ALL TO authenticated 
USING (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()))
WITH CHECK (is_master() OR (tenant_id = get_auth_tenant() AND is_admin()));

-- Adicionar campo de integridade na tabela de campanhas se não existir
ALTER TABLE inventory_campaigns ADD COLUMN IF NOT EXISTS closure_details JSONB;
