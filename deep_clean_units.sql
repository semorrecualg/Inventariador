-- SCRIPT DE LIMPEZA PROFUNDA GBR v24.50
-- Este script normaliza os nomes das unidades em todas as tabelas críticas
-- Substituindo underscores (_) por espaços ( ) e removendo espaços extras

DO $$ 
DECLARE
    t_id TEXT := 'CICOPAL'; -- Tenant principal para filtro (opcional, remova se quiser limpar tudo)
BEGIN
    -- 1. Limpeza na tabela de ATIVOS (Assets)
    -- Tentando detectar a coluna correta (EMPRESA ou UNIDADE_OPERACIONAL)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND LOWER(column_name) = 'empresa') THEN
        EXECUTE 'UPDATE assets SET "EMPRESA" = UPPER(TRIM(REPLACE("EMPRESA", ''_'', '' ''))) WHERE "_tenantid" = ''' || t_id || '''';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'UNIDADE_OPERACIONAL') THEN
        UPDATE assets SET "UNIDADE_OPERACIONAL" = UPPER(TRIM(REPLACE("UNIDADE_OPERACIONAL", '_', ' '))) WHERE "_tenantid" = t_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = '_unitid') THEN
        UPDATE assets SET "_unitid" = UPPER(TRIM(REPLACE("_unitid", '_', ' '))) WHERE "_tenantid" = t_id;
    END IF;

    -- 2. Limpeza na tabela de PERMISSÕES DE USUÁRIO (User Permissions)
    -- Limpa o unitid padrão
    UPDATE user_permissions 
    SET unitid = UPPER(TRIM(REPLACE(unitid, '_', ' '))) 
    WHERE tenantid = t_id;

    -- Limpa o array de unidades (units) - Requer lógica especial para arrays no Postgres
    UPDATE user_permissions
    SET units = (
        SELECT array_agg(UPPER(TRIM(REPLACE(u, '_', ' '))))
        FROM unnest(units) AS u
    )
    WHERE tenantid = t_id AND units IS NOT NULL AND array_length(units, 1) > 0;

    -- 3. Limpeza na tabela de CONFIGURAÇÃO (Inventory Config)
    -- Limpa o array de empresas (companies)
    UPDATE inventory_config
    SET companies = (
        SELECT array_agg(UPPER(TRIM(REPLACE(c, '_', ' '))))
        FROM unnest(companies) AS c
    )
    WHERE _tenantid = t_id AND companies IS NOT NULL AND array_length(companies, 1) > 0;

    RAISE NOTICE 'Limpeza profunda concluída com sucesso!';
END $$;
