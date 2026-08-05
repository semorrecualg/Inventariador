-- ============================================================
-- MIGRAÇÃO: eliminar a coluna legada '_unitid' do Supabase
-- (public schema) — a coluna canônica é 'filial'
-- Inventariador GBR v2.6
--
-- Regra por tabela:
--   A) só '_unitid' existe (sem 'filial')  → SKIP (o app ainda usa
--      '_unitid' como canônico nessas tabelas, ex.: user_permissions)
--   B) '_unitid' E 'filial' existem        → mescla dados (legada só
--      onde 'filial' vazia) + reescreve políticas RLS/índices/
--      constraints que dependem de '_unitid' + DROP '_unitid'
--   C) só 'filial' existe (padrão)         → no-op
--
-- Idempotente: seguro rodar de novo.
-- ============================================================

-- ── Função auxiliar: reconcilia a coluna '_unitid' de UMA tabela ──
CREATE OR REPLACE FUNCTION public.reconcile_unit_column(p_table text)
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
                WHERE table_schema='public' AND table_name=p_table AND column_name='filial')
    INTO v_has_canonical;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name=p_table AND column_name='_unitid')
    INTO v_has_legacy;

  -- Caso A: sem 'filial' → mantém '_unitid' como canônico (skips)
  IF NOT v_has_canonical THEN
    RAISE NOTICE '%-: sem coluna filial; _unitid mantida como canônica (skip)', p_table;
    RETURN;
  END IF;

  -- Caso C: nada a fazer
  IF NOT v_has_legacy THEN
    RAISE NOTICE '%-: nada a fazer (sem _unitid)', p_table;
    RETURN;
  END IF;

  -- Caso B: mescla dados (legada só onde filial está vazia — zero perda)
  EXECUTE format(
    'UPDATE public.%I SET filial = btrim(%I::text)
     WHERE (filial IS NULL OR btrim(filial) = '''' )
       AND %I IS NOT NULL AND btrim(%I::text) <> ''''',
    p_table, '_unitid', '_unitid', '_unitid');

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
           || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%_unitid%'
  LOOP
    v_new_qual  := replace(pol.qual, '_unitid', 'filial');
    v_new_check := replace(pol.withcheck, '_unitid', 'filial');
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
    RAISE NOTICE '%-: policy "%" reescrita de _unitid para filial', p_table, pol.polname;
  END LOOP;

  -- B.2 Remove índices que referenciam a coluna legada
  FOR pol IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename=p_table AND indexdef LIKE '%_unitid%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', pol.indexname);
  END LOOP;

  -- B.3 Remove constraints que referenciam a coluna legada
  FOR pol IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = format('public.%I', p_table)::regclass
      AND pg_get_constraintdef(oid) LIKE '%_unitid%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', p_table, pol.conname);
  END LOOP;

  -- B.4 Drop da coluna legada
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS _unitid', p_table);
  RAISE NOTICE '%-: dados mesclados para filial e coluna _unitid removida', p_table;
END $$;

-- ── Execução nas tabelas candidatas ─────────────────────────────
-- A função decide internamente: só age quando '_unitid' E 'filial' existem.
SELECT public.reconcile_unit_column('assets');
SELECT public.reconcile_unit_column('campaigns');
SELECT public.reconcile_unit_column('campaign_snapshots');
SELECT public.reconcile_unit_column('inventory_campaigns');
SELECT public.reconcile_unit_column('inventory_campaign_snapshots');
SELECT public.reconcile_unit_column('inventory_config');
SELECT public.reconcile_unit_column('unit_configs');
SELECT public.reconcile_unit_column('unit_gps_data');
SELECT public.reconcile_unit_column('user_permissions'); -- terá 'sem filial' → skip esperado

-- ── Verificação pós-migração ───────────────────────────────────
-- (1) Deve retornar APENAS linhas da coluna 'filial' (sem '_unitid'):
--     para a tabela assets espera-se exatamente 1 linha (filial).
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('_unitid', 'filial')
ORDER BY table_name, column_name;

-- (2) Sanidade: NENHUMA política RLS pode referenciar '_unitid'
SELECT c.relname AS tabela, p.polname AS policy,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
       || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '')) LIKE '%_unitid%'
ORDER BY 1, 2;

-- (3) Sanidade: NENHUM índice pode referenciar '_unitid'
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef LIKE '%_unitid%'
ORDER BY 1, 2;
