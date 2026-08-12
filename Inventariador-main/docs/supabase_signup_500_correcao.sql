-- ============================================================================
-- CORREÇÃO DO SIGNUP 500 — "Database error saving new user"
-- (Somente Seções A [diagnóstico] e B [correção])
--
-- Causa: trigger de provisionamento em auth.users apontando para tabela
-- inexistente (public.users) ou colunas renomeadas (_tenantid→tenantid,
-- _unitid→filial) pela migração de tenant.
--
-- COMO USAR:
--   1) Rode a SEÇÃO A (somente leitura) para ver o trigger atual.
--   2) Rode a SEÇÃO B (correção idempotente — pode repetir sem efeito).
--   3) Teste o cadastro no app (Painel → Acessos → +) ou via API.
-- ============================================================================


-- ============================================================================
-- SEÇÃO A — DIAGNÓSTICO (somente leitura, seguro)
-- ============================================================================

-- A.1 — Triggers existentes em auth.users
SELECT
  t.tgname                                   AS trigger_name,
  p.oid::regproc                             AS funcao,
  t.tgenabled                                AS habilitado,
  CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS momento,
  CASE t.tgtype & 4 WHEN 4 THEN 'ROW' ELSE 'STATEMENT' END AS nivel
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth' AND c.relname = 'users'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- A.2 — Código-fonte das funções usadas pelos triggers de auth.users
-- (Procure por referências a `_tenantid`, `_unitid`, `public.users`, `public.profiles`)
SELECT
  p.oid::regproc AS funcao,
  pg_get_functiondef(p.oid) AS definicao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'auth' AND c.relname = 'users'
  AND NOT t.tgisinternal;

-- A.3 — Colunas LEGADAS ainda presentes em user_permissions?
-- Se `_tenantid`/`_unitid` aparecerem aqui, o trigger ainda referencia nomes antigos.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_permissions'
  AND column_name IN ('_tenantid', '_unitid', 'tenant_id', 'unit_id', 'tenants', 'unitid')
ORDER BY column_name;

-- A.4 — As tabelas que um trigger típico de provisionamento usaria existem?
SELECT 'public.users' AS tabela,
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'users') AS existe
UNION ALL
SELECT 'public.profiles',
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'profiles')
UNION ALL
SELECT 'public.user_permissions',
       EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'user_permissions');


-- ============================================================================
-- SEÇÃO B — CORREÇÃO (idempotente)
-- ----------------------------------------------------------------------------
-- 1) Remove triggers de provisionamento existentes em auth.users
--    (nomes padrão do Supabase e variações comuns).
-- 2) Recria `handle_new_user()` gravando em `public.user_permissions` com as
--    colunas ATUAIS (tenantid/filial — padrão pós-migração).
-- 3) Recria o trigger `on_auth_user_created` + política RLS.
-- ============================================================================

-- B.1 — Remover triggers antigos (padrão + variações)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user           ON auth.users;
DROP TRIGGER IF EXISTS on_user_created           ON auth.users;

-- B.2 — Função de provisionamento corrigida (colunas atuais do app)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  v_role text := COALESCE(meta ->> 'role', 'AUDITOR');
  -- A coluna `units` é text[] (schema legado/real). Converte o array jsonb do
  -- metadata para text[] — senão o INSERT falha com 42804 (jsonb vs text[])
  -- e o signUp retorna 500 "Database error saving new user".
  v_units text[] := CASE
    WHEN meta IS NOT NULL AND meta ? 'units' AND jsonb_typeof(meta -> 'units') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(meta -> 'units'))
    ELSE ARRAY[]::text[]
  END;
BEGIN
  INSERT INTO public.user_permissions (
    id, email, username, name, role, tenantid, filial, units, is_admin, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(meta ->> 'username', split_part(COALESCE(NEW.email, ''), '@', 1)),
    COALESCE(meta ->> 'name',     split_part(COALESCE(NEW.email, ''), '@', 1)),
    v_role,
    COALESCE(meta ->> 'tenantid', ''),
    COALESCE(meta ->> 'filial',   ''),
    v_units,
    (v_role IN ('ADMIN', 'MASTER')),
    now(),
    now()
  )
  ON CONFLICT (email) DO UPDATE SET
    id         = EXCLUDED.id,
    username   = EXCLUDED.username,
    name       = EXCLUDED.name,
    role       = EXCLUDED.role,
    tenantid   = EXCLUDED.tenantid,
    filial     = EXCLUDED.filial,
    units      = EXCLUDED.units,
    is_admin   = EXCLUDED.is_admin,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- B.3 — Recriar o trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- B.4 — Garantir que o RLS da user_permissions permite a escrita
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.user_permissions;
CREATE POLICY p_all ON public.user_permissions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
