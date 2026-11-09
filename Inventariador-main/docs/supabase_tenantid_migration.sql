-- ============================================================================
-- GBR KARDEK — Consolidação das colunas de tenant em `tenantid`  (v5)
-- ----------------------------------------------------------------------------
-- Objectivo: cada tabela de `public` passa a ter UMA coluna canónica chamada
-- `tenantid`. As variantes legadas (`tenant_id`, `_tenantid`, `_tenantId`,
-- `tenantId`, `tenants text[]`) são renomeadas ou mescladas e removidas.
--
-- Histórico:
--   v1/v2: migração inicial. Dois problemas reais em produção:
--     • views dependentes (vw_balanco_consolidado_cicopal) bloqueiam o
--       DROP COLUMN com 2BP01 e o CASCADE do HINT apagaria a view;
--     • colunas em camelCase criadas com aspas (`_tenantId`, `tenantId`) são
--       objectos DISTINTOS de `_tenantid`/`tenantid`; a substituição de texto
--       antiga convertia `"_tenantId"` em `"_tenantid"` (coluna já removida) e
--       a recriação de políticas falhava com "column does not exist".
--   v3: backup/recriação de views em tabela temporária.
--   v4: backup de views em tabela PERSISTENTE (sobrevive à sessão — a definição
--       nunca se perde), fecho transitivo view→view, normalização tabela a
--       tabela com RENAME sempre que possível, substituição que trata camelCase,
--       e erros que nomeiam o objecto que bloqueia.
--   v5: as políticas RLS chamam public.get_tenantid(), que não existia nesta
--       base — as políticas ficaram inoperantes e a recriação abortava a
--       migração com "function get_tenantid() does not exist". O PASSO 0-A passa
--       a criar a função explicitamente (com check_function_bodies = off, porque
--       o corpo consulta user_permissions.tenantid, coluna que só existe após o
--       PASSO 2); o PASSO 5-A só garante o search_path e o PASSO 5-B é
--       tolerante: uma política que não possa ser recriada não desfaz a
--       migração — fica guardada em public._gbr_policies_backup com o erro.
--
-- Como usar:
--   1. Colar o ficheiro INTEIRO no SQL Editor do Supabase e executar.
--   2. Se falhar, a transação reverte tudo; corrigir a causa indicada na
--      mensagem (que nomeia a tabela, a coluna e o objecto dependente) e
--      executar de novo. O script é idempotente.
--   3. Verificação no fim do ficheiro (opcional).
--
-- Notas:
--   • Views/matviews voltam com o dono de quem executou; GRANTs,
--     security_invoker/security_barrier e índices de matview não são
--     restaurados — reaplicar se a view for exposta por API.
--   • O backup fica em public._gbr_views_backup e as políticas em
--     public._gbr_policies_backup; podem ser apagados depois de confirmar que
--     views e políticas estão de pé.
--   • O PASSO 0-A cria/atualiza public.get_tenantid() (SECURITY DEFINER, tenant
--     do usuário autenticado em user_permissions). As políticas dependem desta
--     função: se a regra de negócio for outra, alterar aqui.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASSO 0-A — Criar a função auxiliar get_tenantid()
--    As políticas RLS usam `tenantid = get_tenantid()`. A função não estava
--    versionada e chegou a faltar em produção, deixando essas políticas
--    inoperantes. Passa a ser criada aqui, no início, para a migração nunca
--    depender dela de fora.
--    SECURITY DEFINER porque a consulta a user_permissions não pode voltar a
--    passar por RLS (as políticas dessa tabela também filtram por tenant), o que
--    criaria recursão.
--    SET search_path fixo no corpo: boa prática para SECURITY DEFINER.
-- ============================================================================
SET LOCAL check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_tenantid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT up.tenantid
  FROM public.user_permissions up
  WHERE up.id = auth.uid()
  LIMIT 1
$$;

SET LOCAL check_function_bodies = on;

-- ============================================================================
-- PASSO 0 — Guardar as VIEWS/MATVIEWS que dependem das colunas legadas
--    A definição vai para uma tabela PERSISTENTE, portanto nada se perde mesmo
--    que a sessão caia ou que o script falhe a meio. O fecho transitivo
--    acrescenta as views que dependem de views (nível a nível).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public._gbr_views_backup (
  schemaname name        NOT NULL,
  viewname   name        NOT NULL,
  relkind    "char"      NOT NULL,   -- v = view, m = materialized view
  definicao  text        NOT NULL,
  salvo_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schemaname, viewname)
);

-- Views que citam directamente um nome legado
INSERT INTO public._gbr_views_backup (schemaname, viewname, relkind, definicao)
SELECT n.nspname, c.relname, c.relkind, pg_get_viewdef(c.oid, true)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg\_%'
  AND pg_get_viewdef(c.oid, true) ~* '(_tenantid|_tenantId|tenant_id|tenantId|tenants\[)'
ON CONFLICT (schemaname, viewname) DO UPDATE
  SET definicao = EXCLUDED.definicao,
      relkind   = EXCLUDED.relkind,
      salvo_em  = now();

-- Fecho transitivo: views que citam views já guardadas
DO $$
DECLARE
  v_novos int;
BEGIN
  LOOP
    INSERT INTO public._gbr_views_backup (schemaname, viewname, relkind, definicao)
    SELECT n.nspname, c.relname, c.relkind, pg_get_viewdef(c.oid, true)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v', 'm')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg\_%'
      AND NOT EXISTS (
        SELECT 1 FROM public._gbr_views_backup b
        WHERE b.schemaname = n.nspname AND b.viewname = c.relname
      )
      AND EXISTS (
        SELECT 1 FROM public._gbr_views_backup b
        WHERE pg_get_viewdef(c.oid, true) ~* (
          '\m' || regexp_replace(b.viewname::text, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M'
        )
      )
    ON CONFLICT (schemaname, viewname) DO NOTHING;

    GET DIAGNOSTICS v_novos = ROW_COUNT;
    EXIT WHEN v_novos = 0;
  END LOOP;

  RAISE NOTICE 'PASSO 0: % view(s) em backup', (SELECT count(*) FROM public._gbr_views_backup);
END $$;

-- ============================================================================
-- PASSO 0-B — Remover as views guardadas (das mais dependentes para as menos)
--    Repete até estabilizar: uma view pode depender de outra view.
-- ============================================================================
DO $$
DECLARE
  v        RECORD;
  v_volta  int := 0;
  v_pend   int;
BEGIN
  LOOP
    v_volta := v_volta + 1;

    FOR v IN SELECT * FROM public._gbr_views_backup LOOP
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = v.schemaname AND c.relname = v.viewname AND c.relkind IN ('v', 'm')
      );

      BEGIN
        IF v.relkind = 'm' THEN
          EXECUTE format('DROP MATERIALIZED VIEW %I.%I', v.schemaname, v.viewname);
        ELSE
          EXECUTE format('DROP VIEW %I.%I', v.schemaname, v.viewname);
        END IF;
        RAISE NOTICE 'PASSO 0-B: view %.% guardada e removida', v.schemaname, v.viewname;
      EXCEPTION WHEN others THEN
        NULL;   -- ainda tem dependente vivo; nova tentativa na volta seguinte
      END;
    END LOOP;

    SELECT count(*) INTO v_pend
    FROM public._gbr_views_backup b
    WHERE EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = b.schemaname AND c.relname = b.viewname AND c.relkind IN ('v', 'm')
    );

    EXIT WHEN v_pend = 0;

    IF v_volta >= 5 THEN
      RAISE EXCEPTION 'PASSO 0-B: views presas a dependentes não removidos: %',
        (SELECT string_agg(b.schemaname || '.' || b.viewname, ', ')
           FROM public._gbr_views_backup b
          WHERE EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = b.schemaname AND c.relname = b.viewname AND c.relkind IN ('v', 'm')));
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 1 — Preservar as políticas RLS que citam nomes legados
--    Removidas aqui e recriadas no PASSO 5 já apontando para `tenantid`.
-- ============================================================================
CREATE TEMP TABLE IF NOT EXISTS _gbr_policies_to_rebuild (
  schemaname    name,
  tablename     name,
  polname       name,
  polcmd        "char",
  polpermissive boolean,
  roles_sql     text,
  has_public    boolean,
  qual          text,
  with_check    text
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
  AND (pg_get_expr(p.polqual, p.polrelid)      ~* '(_tenantid|_tenantId|tenant_id|tenantId|tenants)'
    OR pg_get_expr(p.polwithcheck, p.polrelid) ~* '(_tenantid|_tenantId|tenant_id|tenantId|tenants)');

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT * FROM _gbr_policies_to_rebuild LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.polname, p.schemaname, p.tablename);
    RAISE NOTICE 'PASSO 1: política %.%.% guardada e removida',
      p.schemaname, p.tablename, p.polname;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 2 — Normalizar colunas, tabela a tabela
--    Por tabela: a primeira coluna legada é RENOMEADA para `tenantid` (o
--    caminho sem risco — índices, constraints, defaults e políticas seguem a
--    renomeação). As restantes, se houver, são mescladas por COALESCE e
--    removidas. Colunas ARRAY (`tenants text[]`) passam a `tenantid text` com
--    o primeiro elemento.
--    Ordem de preferência da coluna a renomear:
--      0 = tenantid / tenant_id / tenantId   (já é o nome "certo")
--      1 = _tenantid / _tenantId             (prefixo legado)
--      2 = tenants                           (array)
-- ============================================================================
DO $$
DECLARE
  t             RECORD;
  c             RECORD;
  tem_canonico  boolean;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name <> 'tenantid'
      AND lower(column_name) IN ('tenant_id', '_tenantid', 'tenantid', 'tenants')
    ORDER BY table_name
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.table_name AND column_name = 'tenantid'
    ) INTO tem_canonico;

    FOR c IN
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.table_name
        AND column_name <> 'tenantid'
        AND lower(column_name) IN ('tenant_id', '_tenantid', 'tenantid', 'tenants')
      ORDER BY (CASE
                  WHEN lower(column_name) IN ('tenantid', 'tenant_id') THEN 0
                  WHEN lower(column_name) = '_tenantid'                THEN 1
                  ELSE 2
                END),
               column_name
    LOOP
      IF c.data_type = 'ARRAY' THEN
        IF NOT tem_canonico THEN
          EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenantid text', t.table_name);
          tem_canonico := true;
        END IF;
        EXECUTE format(
          'UPDATE public.%I SET tenantid = COALESCE(NULLIF(tenantid::text, ''''), (%I)[1]::text)
            WHERE (%I)[1] IS NOT NULL',
          t.table_name, c.column_name, c.column_name);
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', t.table_name, c.column_name);
        RAISE NOTICE 'PASSO 2: %.% (array) → tenantid', t.table_name, c.column_name;

      ELSIF tem_canonico THEN
        EXECUTE format(
          'UPDATE public.%I SET tenantid = COALESCE(NULLIF(tenantid::text, ''''), %I::text)
            WHERE %I IS NOT NULL AND %I::text <> ''''',
          t.table_name, c.column_name, c.column_name, c.column_name);
        BEGIN
          EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', t.table_name, c.column_name);
        EXCEPTION WHEN dependent_objects_still_exist THEN
          RAISE EXCEPTION 'PASSO 2: não foi possível remover %.% — dependentes: %',
            t.table_name, c.column_name,
            (SELECT string_agg(pg_describe_object(d.classid, d.objid, d.objsubid), '; ')
               FROM pg_depend d
               JOIN pg_class rc     ON rc.oid  = d.refobjid
               JOIN pg_namespace rn ON rn.oid  = rc.relnamespace
               JOIN pg_attribute a  ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
              WHERE rn.nspname = 'public'
                AND rc.relname = t.table_name
                AND a.attname  = c.column_name
                AND d.deptype IN ('n', 'a'));
        END;
        RAISE NOTICE 'PASSO 2: %.% mesclada em tenantid e removida', t.table_name, c.column_name;

      ELSE
        EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO tenantid',
          t.table_name, c.column_name);
        tem_canonico := true;
        RAISE NOTICE 'PASSO 2: %.% renomeada para tenantid', t.table_name, c.column_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 3 — Rede de segurança: unique index de `locations`
--    O upsert da aplicação usa onConflict 'name, _tenantid'; se a coluna
--    legada desapareceu, o índice antigo caiu junto → recriamos em
--    (name, tenantid).
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
    RAISE NOTICE 'PASSO 3: unique index locations(name, tenantid) criado';
  END IF;
END $$;

-- ============================================================================
-- PASSO 4 — Recriar as views do backup, apontando para `tenantid`
--    A substituição trata os camelCase entre aspas ANTES das variantes
--    minúsculas, senão `"_tenantId"` viraria `"_tenantid"` (coluna inexistente).
-- ============================================================================
DO $$
DECLARE
  v        RECORD;
  v_def    text;
  v_volta  int := 0;
  v_pend   int;
BEGIN
  LOOP
    v_volta := v_volta + 1;

    FOR v IN SELECT * FROM public._gbr_views_backup LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = v.schemaname AND c.relname = v.viewname AND c.relkind IN ('v', 'm')
      );

      v_def := regexp_replace(btrim(v.definicao), ';\s*$', '');
      v_def := replace(v_def, '"_tenantId"', 'tenantid');
      v_def := replace(v_def, '"_tenantid"', 'tenantid');
      v_def := replace(v_def, '"tenantId"',  'tenantid');
      v_def := replace(v_def, '"_tenant_id"', 'tenantid');
      v_def := replace(v_def, '_tenantId',   'tenantid');
      v_def := replace(v_def, '_tenantid',   'tenantid');
      v_def := replace(v_def, 'tenant_id',   'tenantid');
      v_def := replace(v_def, 'tenantId',    'tenantid');
      v_def := replace(v_def, 'tenants[1]',  'tenantid');

      IF v_def ~* '\mtenants\M' THEN
        RAISE EXCEPTION 'PASSO 4: a view %.% ainda usa a coluna ARRAY "tenants" — ajustar à mão',
          v.schemaname, v.viewname;
      END IF;

      BEGIN
        IF v.relkind = 'm' THEN
          EXECUTE format('CREATE MATERIALIZED VIEW %I.%I AS %s',
            v.schemaname, v.viewname, v_def);
        ELSE
          EXECUTE format('CREATE VIEW %I.%I AS %s', v.schemaname, v.viewname, v_def);
        END IF;
        RAISE NOTICE 'PASSO 4: view %.% recriada com tenantid', v.schemaname, v.viewname;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'PASSO 4: view %.% adiada (%)', v.schemaname, v.viewname, SQLERRM;
      END;
    END LOOP;

    SELECT count(*) INTO v_pend
    FROM public._gbr_views_backup b
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = b.schemaname AND c.relname = b.viewname AND c.relkind IN ('v', 'm')
    );

    EXIT WHEN v_pend = 0;

    IF v_volta >= 5 THEN
      RAISE EXCEPTION 'PASSO 4: views não recriadas: %',
        (SELECT string_agg(b.schemaname || '.' || b.viewname, ', ')
           FROM public._gbr_views_backup b
          WHERE NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = b.schemaname AND c.relname = b.viewname AND c.relkind IN ('v', 'm')));
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- PASSO 5-A — Garantir a função auxiliar get_tenantid()
--    A função é criada no PASSO 0-A. Se já existia noutro schema (por exemplo
--    `auth`), é essa que se usa: basta pôr o schema no search_path para as
--    expressões voltarem a resolver. O ajuste vale até ao fim da transacção.
-- ============================================================================
DO $$
DECLARE
  v_schema name;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'get_tenantid'
    AND pg_get_function_identity_arguments(p.oid) = ''
  ORDER BY (n.nspname = 'public') DESC
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'PASSO 5-A: public.get_tenantid() não existe — o PASSO 0-A devia tê-la criado';
  END IF;

  PERFORM set_config('search_path', format('%I, public', v_schema), true);
  RAISE NOTICE 'PASSO 5-A: get_tenantid() resolvida em %', v_schema;
END $$;

-- ============================================================================
-- PASSO 5-B — Recriar as políticas RLS, apontando para `tenantid`
--    Tolerante a falhas: uma política que não possa ser recriada não desfaz a
--    migração. O DDL completo fica em public._gbr_policies_backup (com o erro)
--    para poder ser restaurado depois de corrigida a causa.
-- ============================================================================
DO $$
DECLARE
  p     RECORD;
  q     text;
  w     text;
  roles text;
  cmd   text;
  per   text;
  ddl   text;
BEGIN
  CREATE TABLE IF NOT EXISTS public._gbr_policies_backup (
    schemaname name        NOT NULL,
    tablename  name        NOT NULL,
    polname    name        NOT NULL,
    ddl        text        NOT NULL,
    erro       text,
    salvo_em   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (schemaname, tablename, polname)
  );

  FOR p IN SELECT * FROM _gbr_policies_to_rebuild LOOP
    q := p.qual;
    w := p.with_check;

    IF q IS NOT NULL THEN
      q := replace(q, '"_tenantId"', 'tenantid');
      q := replace(q, '"_tenantid"', 'tenantid');
      q := replace(q, '"tenantId"',  'tenantid');
      q := replace(q, '"_tenant_id"', 'tenantid');
      q := replace(q, '_tenantId',   'tenantid');
      q := replace(q, '_tenantid',   'tenantid');
      q := replace(q, 'tenant_id',   'tenantid');
      q := replace(q, 'tenantId',    'tenantid');
    END IF;
    IF w IS NOT NULL THEN
      w := replace(w, '"_tenantId"', 'tenantid');
      w := replace(w, '"_tenantid"', 'tenantid');
      w := replace(w, '"tenantId"',  'tenantid');
      w := replace(w, '"_tenant_id"', 'tenantid');
      w := replace(w, '_tenantId',   'tenantid');
      w := replace(w, '_tenantid',   'tenantid');
      w := replace(w, 'tenant_id',   'tenantid');
      w := replace(w, 'tenantId',    'tenantid');
    END IF;

    roles := p.roles_sql;
    IF roles IS NULL OR roles = '' THEN
      roles := 'PUBLIC';
    ELSIF p.has_public THEN
      roles := 'PUBLIC, ' || roles;
    END IF;

    cmd := CASE p.polcmd
             WHEN 'r' THEN 'SELECT'
             WHEN 'a' THEN 'INSERT'
             WHEN 'w' THEN 'UPDATE'
             WHEN 'd' THEN 'DELETE'
             ELSE 'ALL'
           END;
    per := CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END;

    ddl := CASE
      WHEN q IS NULL AND w IS NULL THEN
        format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
          p.polname, p.schemaname, p.tablename, per, cmd, roles)
      WHEN q IS NULL THEN
        format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s WITH CHECK (%s)',
          p.polname, p.schemaname, p.tablename, per, cmd, roles, w)
      WHEN w IS NULL THEN
        format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s)',
          p.polname, p.schemaname, p.tablename, per, cmd, roles, q)
      ELSE
        format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s USING (%s) WITH CHECK (%s)',
          p.polname, p.schemaname, p.tablename, per, cmd, roles, q, w)
    END;

    BEGIN
      EXECUTE ddl;
      RAISE NOTICE 'PASSO 5-B: política %.%.% recriada com tenantid',
        p.schemaname, p.tablename, p.polname;
    EXCEPTION WHEN others THEN
      INSERT INTO public._gbr_policies_backup (schemaname, tablename, polname, ddl, erro)
      VALUES (p.schemaname, p.tablename, p.polname, ddl, SQLERRM)
      ON CONFLICT (schemaname, tablename, polname)
      DO UPDATE SET ddl = EXCLUDED.ddl, erro = EXCLUDED.erro, salvo_em = now();
      RAISE NOTICE 'PASSO 5-B: ATENÇÃO política %.%.% NÃO recriada (%); DDL guardado em public._gbr_policies_backup',
        p.schemaname, p.tablename, p.polname, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICAÇÃO (opcional — executar depois do COMMIT)
-- ----------------------------------------------------------------------------
-- 1) Colunas legadas restantes (deve retornar 0 linhas):
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name <> 'tenantid'
  AND lower(column_name) IN ('tenant_id', '_tenantid', 'tenantid', 'tenants')
ORDER BY 1, 2, 3;

-- 2) Políticas RLS que ainda citam nomes legados (deve retornar 0 linhas):
SELECT n.nspname AS schema, c.relname AS tabela, p.polname AS politica,
       pg_get_expr(p.polqual, p.polrelid)      AS qual,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
FROM pg_policy p
JOIN pg_class c     ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (pg_get_expr(p.polqual, p.polrelid)      ~* '(_tenantid|_tenantId|tenant_id|tenantId|tenants)'
    OR pg_get_expr(p.polwithcheck, p.polrelid) ~* '(_tenantid|_tenantId|tenant_id|tenantId|tenants)');

-- 3) Panorama: colunas `tenantid` finais:
SELECT table_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'tenantid'
ORDER BY 1;

-- 4) Views do backup já recriadas (todas devem existir):
SELECT b.schemaname, b.viewname,
       EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = b.schemaname AND c.relname = b.viewname AND c.relkind IN ('v', 'm')
       ) AS recriada
FROM public._gbr_views_backup b
ORDER BY 1, 2;

-- 5) Políticas RLS existentes por tabela:
SELECT c.relname AS tabela, p.polname AS politica, p.polcmd AS cmd
FROM pg_policy p
JOIN pg_class c     ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY 1, 2;

-- 6) Políticas que não puderam ser recriadas (deve retornar 0 linhas;
--    se houver, o DDL e o erro estão aqui para restaurar após a correção):
SELECT schemaname, tablename, polname, erro, salvo_em
FROM public._gbr_policies_backup
ORDER BY 1, 2, 3;

-- 7) Função auxiliar usada pelas políticas:
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'get_tenantid';

-- Limpeza dos backups (só depois de confirmar os itens 4 e 6):
-- DROP TABLE public._gbr_views_backup;
-- DROP TABLE public._gbr_policies_backup;
