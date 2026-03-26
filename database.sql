
-- ===============================================================
-- GBR v24.50 - TRILHA DE AUDITORIA ROBUSTA (AUDIT TRAIL)
-- ===============================================================

-- 1. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'
    table_name TEXT,
    record_id TEXT,
    old_data JSONB,
    new_data JSONB,
    details TEXT,
    tenant_id TEXT,
    origin TEXT -- 'INVENTORY', 'LABELING', 'ACCOUNT_RECONCILIATION'
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Segurança (RLS)
-- Admins podem ver tudo do seu tenant
CREATE POLICY "Admins can view audit logs of their tenant" 
ON public.audit_logs 
FOR SELECT 
USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'MASTER') 
    AND (tenant_id = ((auth.jwt() -> 'user_metadata') ->> 'tenantid') OR tenant_id IS NULL)
);

-- Usuários podem ver seus próprios logs
CREATE POLICY "Users can view their own audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (user_email = auth.jwt() ->> 'email');

-- Apenas o sistema (ou triggers) pode inserir logs
CREATE POLICY "System can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (
    tenant_id = ((auth.jwt() -> 'user_metadata') ->> 'tenantid') 
    OR tenant_id IS NULL -- Permite logs de sistema ou pré-autenticação
);

-- 4. Função de Trigger para Auditoria Automática de Ativos
CREATE OR REPLACE FUNCTION public.process_asset_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (
            user_email,
            action,
            table_name,
            record_id,
            old_data,
            new_data,
            tenant_id,
            origin
        )
        VALUES (
            COALESCE(current_setting('app.current_user_email', true), 'system'),
            'UPDATE',
            'assets',
            OLD.id::text,
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW."_tenantid",
            NEW."_origemTransacao"
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (
            user_email,
            action,
            table_name,
            record_id,
            old_data,
            tenant_id
        )
        VALUES (
            COALESCE(current_setting('app.current_user_email', true), 'system'),
            'DELETE',
            'assets',
            OLD.id::text,
            to_jsonb(OLD),
            OLD."_tenantid"
        );
        RETURN OLD;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (
            user_email,
            action,
            table_name,
            record_id,
            new_data,
            tenant_id,
            origin
        )
        VALUES (
            COALESCE(current_setting('app.current_user_email', true), 'system'),
            'INSERT',
            'assets',
            NEW.id::text,
            to_jsonb(NEW),
            NEW."_tenantid",
            NEW."_origemTransacao"
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Aplicar Trigger na tabela de ativos
DROP TRIGGER IF EXISTS trg_asset_audit ON public.assets;
CREATE TRIGGER trg_asset_audit
AFTER INSERT OR UPDATE OR DELETE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.process_asset_audit();

-- 6. Índices para Performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);

-- ===============================================================
-- GBR v24.50 - CAMPANHAS DE INVENTÁRIO (INVENTORY EVENTS)
-- ===============================================================

-- 1. Tabela de Campanhas
CREATE TABLE IF NOT EXISTS public.inventory_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ DEFAULT now(),
    end_date TIMESTAMPTZ,
    status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'CLOSED', 'ARCHIVED'
    tenant_id TEXT NOT NULL,
    created_by TEXT NOT NULL
);

-- 2. Habilitar RLS
ALTER TABLE public.inventory_campaigns ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Segurança (RLS) para Campanhas
CREATE POLICY "Users can view campaigns of their tenant" 
ON public.inventory_campaigns 
FOR SELECT 
USING (tenant_id = ((auth.jwt() -> 'user_metadata') ->> 'tenantid'));

CREATE POLICY "Admins can manage campaigns of their tenant" 
ON public.inventory_campaigns 
FOR ALL 
USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'MASTER') 
    AND tenant_id = ((auth.jwt() -> 'user_metadata') ->> 'tenantid')
);

-- 4. Adicionar coluna de campanha à tabela de ativos
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS "_campaignId" UUID REFERENCES public.inventory_campaigns(id);
CREATE INDEX IF NOT EXISTS idx_assets_campaign ON public.assets("_campaignId");
