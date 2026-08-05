-- ============================================================
-- MIGRAÇÃO UNIVERSAL: padronizar TODAS as variantes de coluna
-- tenant → 'tenantid' (Supabase, public schema)
-- Inventariador GBR v2.6
--
-- Cobre os 3 cenários por tabela:
--   A) só a variante legada existe   → RENAME para tenantid
--   B) legada E tenantid existem     → mescla dados + reescreve
--      políticas RLS/índices que dependem da legada + DROP legada
--   C) já padronizada                → no-op
--
-- Idempotente: seguro rodar de novo.
-- ============================================================

-- ── Função auxiliar: reconcilia UMA coluna legada ─────────────
CREATE OR REPLACE FUNCTION public.reconcile_tenant_column(p_table text, p_legacy text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_canonical boolean;
  v_has_legacy   boolean;
  pol RECORD;
  v_new_qual     text;
  v_new_check    text;
  v_roles        text;
  v_cmd          text;
  v_perm         text;
  v_clauses      text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table AND column_name='tenantid')
    INTO v_has_canonical;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table AND column_name=p_legacy)
    INTO v_has_legacy;

  -- Caso C: nada a fazer
  IF NOT v_has_legacy THEN
    RAISE NOTICE '%-%: nada a fazer', p_table, p_legacy;
    RETURN;
  END IF;

  -- Caso A: só a legada existe → rename
  IF NOT v_has_canonical THEN
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO tenantid', p_table, p_legacy);
    RAISE NOTICE '%-%: renomeada para tenantid', p_table, p_legacy;
    RETURN;
  END IF;

  -- Caso B: ambas existem → mescla dados (legada só onde canônica vazia)
  EXECUTE format(
    'UPDATE public.%I SET tenantid = btrim(%I::text)
     WHERE (tenantid IS NULL OR btrim(tenantid) = '''')
       AND %I IS NOT NULL AND btrim(%I::text) <> ''''',
    p_table, p_legacy, p_legacy, p_legacy);

  -- B.1 Reescreve políticas RLS que referenciam a coluna legada
  FOR pol IN
    SELECT p.polname,
           COALESCE(pg_get_expr(p.polqual, p.polrelid), 'true') AS qual,
           COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), 'true') AS withcheck,
           p.polcmd,
           COALESCE(array_to_string(ARRAY(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(p.polroles)), ', '), '') AS roles,
           p.polpermissive
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = p_table
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
           || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%' || p_legacy || '%'
  LOOP
    v_new_qual  := replace(pol.qual, p_legacy, 'tenantid');
    v_new_check := replace(pol.withcheck, p_legacy, 'tenantid');
    v_cmd  := CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                              WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;
    v_perm := CASE WHEN pol.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    EXECUTE format('DROP POLICY %I ON public.%I', pol.polname, p_table);

    -- Regra do PostgreSQL: INSERT aceita SOMENTE WITH CHECK; SELECT e
    -- DELETE aceitam SOMENTE USING; UPDATE e ALL aceitam ambos.
    IF pol.polcmd = 'a' THEN                     -- INSERT
      v_clauses := 'WITH CHECK (' || v_new_check || ')';
    ELSIF pol.polcmd IN ('r', 'd') THEN          -- SELECT, DELETE
      v_clauses := 'USING (' || v_new_qual || ')';
    ELSE                                         -- UPDATE, ALL
      v_clauses := 'USING (' || v_new_qual || ') WITH CHECK (' || v_new_check || ')';
    END IF;

    IF pol.roles = '' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s %s',
                     pol.polname, p_table, v_perm, v_cmd, v_clauses);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s %s',
                     pol.polname, p_table, v_perm, v_cmd, pol.roles, v_clauses);
    END IF;
    RAISE NOTICE '%-%: policy "%" reescrita para tenantid', p_table, p_legacy, pol.polname;
  END LOOP;

  -- B.2 Remove índices que referenciam a coluna legada
  FOR pol IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename=p_table AND indexdef LIKE '%' || p_legacy || '%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', pol.indexname);
  END LOOP;

  -- B.3 Remove constraints que referenciam a coluna legada
  FOR pol IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = format('public.%I', p_table)::regclass
      AND pg_get_constraintdef(oid) LIKE '%' || p_legacy || '%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', p_table, pol.conname);
  END LOOP;

  -- B.4 Drop da coluna legada
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', p_table, p_legacy);
  RAISE NOTICE '%-%: dados mesclados e coluna legada removida', p_table, p_legacy;
END $$;

-- ── Execução em todas as tabelas (ordem importa: primária antes) ──
SELECT public.reconcile_tenant_column('asset_logs', 'tenant_id');
SELECT public.reconcile_tenant_column('assets', '_tenantid');
SELECT public.reconcile_tenant_column('audit_logs', 'tenant_id');
SELECT public.reconcile_tenant_column('campaign_snapshots', '_tenantid');
SELECT public.reconcile_tenant_column('campaigns', 'tenant_id');
SELECT public.reconcile_tenant_column('inventory_campaign_snapshots', 'tenant_id');
SELECT public.reconcile_tenant_column('inventory_campaigns', '_tenantid'); -- primária
SELECT public.reconcile_tenant_column('inventory_campaigns', 'tenant_id'); -- secundária
SELECT public.reconcile_tenant_column('inventory_config', '_tenantId');    -- primária (case original)
SELECT public.reconcile_tenant_column('inventory_config', '_tenantid');    -- secundária
SELECT public.reconcile_tenant_column('unit_gps_data', '_tenantid');
SELECT public.reconcile_tenant_column('user_permissions', '_tenantid');
-- Resíduos camelCase (não pegos pelos diagnósticos lower()): colunas mortas,
-- o código só escreve 'tenantid'. Caso B: mescla dados + reescreve policies + drop.
SELECT public.reconcile_tenant_column('campaigns', 'tenantId');
SELECT public.reconcile_tenant_column('user_permissions', 'tenantId');

-- ── Verificação pós-migração ───────────────────────────────────
-- (1) Deve listar APENAS 'tenantid' — qualquer outra linha (ou linha duplicada)
--     é resíduo. Nota: lower('tenantId') = 'tenantid', então pega camelCase também.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND lower(column_name) IN ('tenantid', '_tenantid', 'tenant_id', 'tenantid2')
ORDER BY table_name;

-- (2) Deve listar 'tenantid' em todas as 10 tabelas
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND lower(column_name) = 'tenantid'
ORDER BY table_name;
