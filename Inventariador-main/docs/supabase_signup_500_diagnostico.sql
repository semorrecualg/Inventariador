-- ============================================================================
-- DIAGNÓSTICO E CORREÇÃO — "Database error saving new user" (500 no signUp)
-- ----------------------------------------------------------------------------
-- Projeto: Inventariador GBR KARDEK
--
-- O que é este erro:
--   O GoTrue (serviço de Auth do Supabase) falha ao INSERIR em `auth.users`.
--   A causa clássica é um TRIGGER em `auth.users` (ex.: `on_auth_user_created`
--   → `handle_new_user`) cuja função referencia uma tabela que NÃO existe
--   (ex.: `public.users` renomeada para `user_permissions`) ou colunas RENOMEADAS
--   pela migração de tenant (`_tenantid` → `tenantid`, `_unitid` → `filial`).
--
-- Diagnóstico já confirmado via REST (em 2026-08-10):
--   • `public.user_permissions` EXISTE e tem dados (perfil do proprietário).
--   • `public.users` NÃO existe (404 PGRST205) — tabela renomeada pela migração.
--   • `public.profiles` existe e está vazia.
--   → Se o trigger padrão do Supabase aponta para `public.users` (ou para
--     colunas legadas), TODO signUp falha com 500.
--
-- COMO USAR:
--   1) Abra o SQL Editor do painel Supabase (Dashboard → SQL Editor).
--   2) Execute a SEÇÃO A (diagnóstico) — é somente leitura e mostra o trigger.
--   3) Se o diagnóstico confirmar trigger quebrado, execute a SEÇÃO B (correção).
--   4) Re-teste o cadastro no app (Painel → Acessos → +) ou via curl/Postman.
--   5) Opcional: Logs Explorer do dashboard, filtrando pelo `error_id` da resposta
--      500 (ex.: 019febff-...), mostra o erro Postgres real por trás do erro.
-- ============================================================================


-- ============================================================================
-- SEÇÃO A — DIAGNÓSTICO (somente leitura, seguro de rodar)
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
-- Se `_tenantid`/`_unitid` aparecerem aqui, a migração NÃO foi concluída
-- ou o trigger ainda referencia os nomes antigos.
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

-- A.5 — Dica: no painel Supabase, confira em
--   Authentication → Sign In / Providers (ou User Management)
--   o campo "Users table" (tabela de usuários). Se apontar para `public.users`
--   ou uma tabela inexistente, aponte para `public.user_permissions`.


-- ============================================================================
-- SEÇÃO B — CORREÇÃO (só execute após confirmar o diagnóstico)
-- ----------------------------------------------------------------------------
-- 1) Remove os triggers de provisionamento existentes em auth.users
--    (nomes padrão do Supabase e variações comuns).
-- 2) Recria a função `handle_new_user()` apontando para `public.user_permissions`
--    com as colunas ATUAIS (tenantid/filial — padrão pós-migração).
-- 3) Recria o trigger `on_auth_user_created`.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
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
-- (a política p_all do bootstrap permite anon/authenticated; recria se faltar)
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_all ON public.user_permissions;
CREATE POLICY p_all ON public.user_permissions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);


-- ============================================================================
-- SEÇÃO C — VERIFICAÇÃO
-- ============================================================================
-- Re-execute a SEÇÃO A: o trigger deve aparecer apontando para handle_new_user.
--
-- Teste rápido pela API (troque URL/key pelas do seu .env.local):
--   curl -X POST https://SEU_PROJETO.supabase.co/auth/v1/signup \
--     -H "apikey: SUA_ANON_KEY" -H "Content-Type: application/json" \
--     -d '{"email":"teste@empresa.com","password":"Senha#123","data":{"username":"teste","role":"AUDITOR","tenantid":"CICOPAL","filial":"010101 CICOPAL GO"}}'
--
-- Sucesso esperado: HTTP 200 com `access_token`/`user` (ou confirmação de e-mail).
-- Em seguida, confira se a linha apareceu em public.user_permissions.
--
-- Se ainda falhar, capture o `error_id` da resposta 500 e procure em
-- Dashboard → Logs Explorer (filtro: error_id = 'SEU_ERROR_ID').
-- ============================================================================
