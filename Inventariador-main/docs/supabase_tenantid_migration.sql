-- ============================================================================
-- Inventariador — Migração Supabase: campo canônico único `tenantid`
-- ----------------------------------------------------------------------------
-- Elimina todas as variantes de coluna de tenant
--   (tenant_id, _tenantid, "tenantId" / TenantId, tenants-array)
-- e padroniza para `tenantid` em TODAS as tabelas do schema `public`,
-- SEM perder dados (merge/rename preservando valores existentes) e
-- SEM perder as políticas RLS (elas são capturadas, removidas durante a
-- migração e RECRIADAS apontando para `tenantid`).
--
-- Histórico:
--   v1: falhou com 2BP01 "cannot drop column _tenantid ... because other
--       objects depend on it" (políticas RLS bloqueiam o DROP).
--   v2: PASSO 0 captura/reconstrói as políticas RLS afetadas antes do DROP.
--
-- Como usar:
--   1) Abra o SQL Editor do painel Supabase (Dashboard → SQL Editor).
--   2) Cole TODO o conteúdo e execute (Run). Pode rodar sobre o estado atual
--      (a execução anterior falhou dentro da TRANSAÇÃO e foi revertida).
--   3) IDEMPOTENTE: pode rodar de novo sem efeito colateral.
--   4) Após rodar, execute a seção "VERIFICAÇÃO" (opcional) para confirmar.
--
-- Escopo:
--   - Apenas schema `public`, apenas BASE TABLE (auth/storage/etc. intactos).
--   - A coluna canônica `tenantid` nunca é tocada.
--   - Colunas `tenants` (ARRAY) viram `tenantid` text com o 1º elemento.
--   - A TABELA `tenants` não é renomeada (a decisão vale para o CAMPO).
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASSO 0 — Preservar políticas RLS que citam nomes legados de tenant
-- ----------------------------------------------------------------------------
-- Captura as definições (nome, comando, roles, USING e WITH CHECK) das
-- políticas do schema public cujas expressões citam tenant_id/_tenantid/
-- tenantId/tenants, e as REMOVE temporariamente. Elas serão recriadas no
-- PASSO 3, já apontando para `tenantid`. Isso desbloqueia o DROP de coluna
-- sem nunca apagar política de segurança.
-- ============================================================================
CREATE TEMP TABLE IF NOT EXISTS _gbr_policies_to_rebuild (
  schemaname   name,
  tablename    name,
  polname      name,
  polcmd       "char",
  polpermissive boolean,
  roles_sql    text,
  has_public   boolean,
  qual         text,
  with_check   text
);

TRUNCATE _gbr_policies_to_rebuild;

INSERT INTO _gbr_policies_to_rebuild
  (schemaname, tablename, polname, polcmd, polpermissive, roles_sql, has_public, qual, with_check)
SELECT
  n.nspname,
  c.relname,
  p.polname,
  p.polcmd,
  p.polpermissive,
  (SELECT COALESCE(string_agg(quote_ident(r.rolname), ', ' ORDER BY r.rolname), '')
     FROM pg_roles r WHERE r.oid = ANY(p.polroles)),
  (0 = ANY(p.polroles)),
  pg_get_expr(p.polqual, p.polrelid),
  pg_get_expr(p.polwithcheck, p.polrelid)
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (pg_get_expr(p.polqual, p.polrelid)      ~* 'tenant_id|_tenantid|tenantId|tenants'
    OR pg_get_expr(p.polwithcheck, p.polrelid) ~* 'tenant_id|_tenantid|tenantId|tenants');

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT * FROM _gbr_policies_to_rebuild LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.polname, p.schemaname, p.tablename);
    RAISE NOTICE 'Policy %I.%I removida temporariamente (será recriada com tenantid)', p.schemaname || '.' || p.tablename, p.polname;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 1 — NORMALIZAÇÃO GLOBAL DE COLUNAS → `tenantid`
--    A) tabela JÁ tem `tenantid` .......... merge de dados + DROP da legada
--    B) NÃO tem e coluna é escalar ........ RENAME COLUMN → tenantid
--    C) NÃO tem e coluna é ARRAY (tenants) ADD tenantid text + copia [1] + DROP
-- ============================================================================
DO $$
DECLARE
  r             RECORD;
  has_canonical BOOLEAN;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
     AND t.table_type   = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name <> 'tenantid'                 -- nunca toca o canônico
      AND lower(c.column_name) IN ('tenant_id', '_tenantid', 'tenantid', 'tenants')
    ORDER BY c.table_name, c.column_name
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns c2
      WHERE c2.table_schema = r.table_schema
        AND c2.table_name   = r.table_name
        AND c2.column_name  = 'tenantid'
    ) INTO has_canonical;

    IF r.data_type = 'ARRAY' THEN
      -- Coluna plural (ex: tenants text[]) → tenantid text com o 1º elemento
      IF has_canonical THEN
        EXECUTE format(
          'UPDATE %I.%I SET tenantid = COALESCE(NULLIF(tenantid,''''), %I[1]::text) WHERE %I[1] IS NOT NULL',
          r.table_schema, r.table_name, r.column_name, r.column_name);
        EXECUTE format('ALTER TABLE %I.%I DROP COLUMN %I',
          r.table_schema, r.table_name, r.column_name);
      ELSE
        EXECUTE format('ALTER TABLE %I.%I ADD COLUMN tenantid text',
          r.table_schema, r.table_name);
        EXECUTE format('UPDATE %I.%I SET tenantid = %I[1]::text WHERE %I[1] IS NOT NULL',
          r.table_schema, r.table_name, r.column_name, r.column_name);
        EXECUTE format('ALTER TABLE %I.%I DROP COLUMN %I',
          r.table_schema, r.table_name, r.column_name);
      END IF;
      RAISE NOTICE 'Tenant array %I.%I migrada para tenantid', r.table_schema, r.table_name;
    ELSIF has_canonical THEN
      -- Canônico já existe → mescla dados e remove a legada
      EXECUTE format(
        'UPDATE %I.%I SET tenantid = COALESCE(NULLIF(tenantid,''''), %I::text) WHERE %I IS NOT NULL AND %I::text <> ''''',
        r.table_schema, r.table_name, r.column_name, r.column_name, r.column_name);
      EXECUTE format('ALTER TABLE %I.%I DROP COLUMN %I',
        r.table_schema, r.table_name, r.column_name);
      RAISE NOTICE 'Coluna %I.%I mesclada em tenantid e removida', r.table_schema, r.table_name;
    ELSE
      -- Renomeia a coluna legada para o canônico (índices/constraints seguem)
      EXECUTE format('ALTER TABLE %I.%I RENAME COLUMN %I TO tenantid',
        r.table_schema, r.table_name, r.column_name);
      RAISE NOTICE 'Coluna %I.%I renomeada para tenantid', r.table_schema, r.table_name;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 2 — REDE DE SEGURANÇA: unique index da tabela `locations`
--    A aplicação usa upsert com onConflict 'name, _tenantid'; se a coluna
--    legada foi DROPADA, o índice antigo cai junto → recriamos em (name, tenantid).
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'tenantid'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'locations'
      AND indexdef ILIKE '%tenantid%' AND indexdef ILIKE '%name%'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS locations_name_tenantid_key
      ON public.locations (name, tenantid);
    RAISE NOTICE 'Unique index locations(name, tenantid) garantido';
  END IF;
END $$;

-- ============================================================================
-- PASSO 3 — RECRIAR as políticas RLS preservadas, apontando para `tenantid`
-- ============================================================================
DO $$
DECLARE
  p     RECORD;
  q     TEXT;
  w     TEXT;
  roles TEXT;
  cmd   TEXT;
  per   TEXT;
BEGIN
  FOR p IN SELECT * FROM _gbr_policies_to_rebuild LOOP
    -- Reescreve identificadores legados → tenantid nas expressões
    q := p.qual;
    w := p.with_check;
    IF q IS NOT NULL THEN
      q := replace(q, '_tenantid', 'tenantid');
      q := replace(q, 'tenant_id', 'tenantid');
      q := replace(q, 'tenantId', 'tenantid');
    END IF;
    IF w IS NOT NULL THEN
      w := replace(w, '_tenantid', 'tenantid');
      w := replace(w, 'tenant_id', 'tenantid');
      w := replace(w, 'tenantId', 'tenantid');
    END IF;

    -- Roles (com suporte a PUBLIC)
    roles := p.roles_sql;
    IF roles IS NULL OR roles = '' THEN
      roles := 'PUBLIC';
    ELSIF p.has_public THEN
      roles := 'PUBLIC, ' || roles;
    END IF;

    -- Comando da policy
    cmd := CASE p.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END;

    -- Modo (permissiva/restritiva)
    per := CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    IF q IS NULL AND w IS NULL THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
        p.polname, p.schemaname, p.tablename, per, cmd, roles);
    ELSIF q IS NULL THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s WITH CHECK (%s)',
        p.polname, p.schemaname, p.tablename, per, cmd, roles, w);
    ELSIF w IS NULL THEN
      EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s)',
        p.polname, p.schemaname, p.tablename, per, cmd, roles, q);
    ELSE
      EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s) WITH CHECK (%s)',
        p.polname, p.schemaname, p.tablename, per, cmd, roles, q, w);
    END IF;
    RAISE NOTICE 'Policy %I.%I recriada com tenantid', p.schemaname || '.' || p.tablename, p.polname;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (opcional — rode depois)
-- ----------------------------------------------------------------------------
-- 1) Colunas legadas restantes (deve retornar 0 linhas):
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IS DISTINCT FROM 'tenantid'
  AND lower(column_name) IN ('tenant_id', '_tenantid', 'tenantid', 'tenants')
ORDER BY 1, 2, 3;

-- 2) Políticas RLS que AINDA citam nomes legados (deve retornar 0 linhas):
SELECT n.nspname AS schema, c.relname AS tabela, p.polname AS politica,
       pg_get_expr(p.polqual, p.polrelid) AS qual,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (pg_get_expr(p.polqual, p.polrelid) ~* 'tenant_id|_tenantid|tenantId|tenants'
    OR pg_get_expr(p.polwithcheck, p.polrelid) ~* 'tenant_id|_tenantid|tenantId|tenants');

-- 3) Panorama: colunas `tenantid` finais por tabela:
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'tenantid'
ORDER BY table_name;

-- 4) Panorama: políticas RLS existentes (conferir que as 3 de user_permissions
--    continuam lá, agora usando `tenantid`):
SELECT c.relname AS tabela, p.polname AS politica, p.polcmd AS cmd
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, p.polname;
