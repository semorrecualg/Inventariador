-- Script para adicionar colunas faltantes na tabela assets sem deletar dados existentes
DO $$ 
BEGIN 
    -- 1. Unitarização (ID do Ativo Pai)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_parent_id') THEN
        ALTER TABLE public.assets ADD COLUMN "_parent_id" TEXT;
    END IF;

    -- 2. Flag de Unitarização
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_is_unitized') THEN
        ALTER TABLE public.assets ADD COLUMN "_is_unitized" BOOLEAN DEFAULT FALSE;
    END IF;

    -- 3. Relacionamento com Campanhas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_campaignId') THEN
        ALTER TABLE public.assets ADD COLUMN "_campaignId" UUID;
    END IF;

    -- 4. Controle Master (Plaqueta e Local)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_plaquetaMaster') THEN
        ALTER TABLE public.assets ADD COLUMN "_plaquetaMaster" TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_localMaster') THEN
        ALTER TABLE public.assets ADD COLUMN "_localMaster" TEXT;
    END IF;

    -- 5. Isolamento de dados (Tenant/Unit)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_tenantid') THEN
        ALTER TABLE public.assets ADD COLUMN "_tenantid" TEXT DEFAULT 'GERAL';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_unitid') THEN
        ALTER TABLE public.assets ADD COLUMN "_unitid" TEXT;
    END IF;
    
    -- 6. Campos Contábeis Adicionais (Finalização do Módulo de Ativo Fixo)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_valor_residual') THEN
        ALTER TABLE public.assets ADD COLUMN "_valor_residual" DECIMAL(15,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='assets' AND column_name='_depreciacao_acumulada') THEN
        ALTER TABLE public.assets ADD COLUMN "_depreciacao_acumulada" DECIMAL(15,2);
    END IF;

END $$;
