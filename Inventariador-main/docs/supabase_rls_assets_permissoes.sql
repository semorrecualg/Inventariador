-- ============================================================================
-- GBR KARDEK — RLS de `assets` e `user_permissions` (exposição restante)
-- ----------------------------------------------------------------------------
-- Fecha o que ficou de fora de docs/supabase_privacidade_storage.sql:
--
--   • public.assets tinha `p_all` para anon, authenticated com
--     USING (true) WITH CHECK (true) — a base inteira de qualquer contrato,
--     legível e apagável sem sessão.
--   • public.user_permissions tinha o mesmo `p_all`: `anon` lia e-mails,
--     papéis, contratos e filiais de todos os utilizadores.
--
-- O que passa a valer:
--
--   assets          — só `authenticated`; cada utilizador vê o contrato do seu
--                     perfil. O papel MASTER (dono global) mantém a visão entre
--                     contratos (download da nuvem, gestão de base). Um ADMIN
--                     de contrato fica limitado ao próprio contrato.
--   user_permissions— `anon` deixa de ter qualquer privilégio de tabela. O login
--                     por username (que acontece ANTES do signIn) passa a usar a
--                     função `email_by_username(text)`, que devolve só o e-mail,
--                     por igualdade exata.
--                     Cada utilizador lê e corrige a própria linha (o app
--                     sincroniza `id` com o Auth no primeiro login); papel,
--                     `is_admin`, contrato e unidades ficam congelados para
--                     quem não é admin. Um ADMIN/MASTER gere os utilizadores do
--                     seu contrato; só MASTER atravessa contratos.
--
-- Antes de aplicar (só leitura) — ver o bloco VERIFICAÇÃO no fim:
--   • ativos com `tenantid` vazio ficam invisíveis para não-MASTER;
--   • o dono global precisa de `role = 'MASTER'` para continuar a ver tudo;
--   • perfis com `id` nulo continuam a entrar (get_tenantid casa pelo e-mail);
--   • contas criadas pelo ecrã de registo nascem AUDITOR e SEM contrato: o
--     vínculo passa a ser dado por um administrador.
--
-- Seguinte: docs/supabase_rls_tabelas_restantes.sql fecha inventory_config,
-- audit_logs, locations, campaigns, campaign_snapshots, asset_logs e
-- base_generation (unit_configs fica assinalada como exposição em aberto).
--
-- Como usar: colar o ficheiro inteiro no SQL Editor do Supabase. Se falhar, a
-- transacção reverte tudo. Pode ser executado mais de uma vez.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASSO 1 — funções de apoio (idempotentes, SECURITY DEFINER)
--   SECURITY DEFINER é obrigatório: as políticas chamam-nas e elas leem
--   user_permissions — sem isso, a política de user_permissions chamar-se-ia a
--   si mesma (erro 42P17, "infinite recursion detected in policy").
-- ============================================================================
SET LOCAL check_function_bodies = off;

-- get_tenantid(): contrato do utilizador autenticado. Casa pelo id do Auth e,
-- como rede de segurança, pelo e-mail do JWT: há perfis legados com `id`
-- nulo/desalinhado, e o app só os corrige depois de ler o perfil.
CREATE OR REPLACE FUNCTION public.get_tenantid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT up.tenantid
  FROM public.user_permissions up
  WHERE public.is_self_row(up.id, up.email)
  ORDER BY (up.id = auth.uid()) DESC
  LIMIT 1
$$;

-- is_self_row(): a linha pertence ao utilizador do pedido (por id ou e-mail).
-- Recebe os valores por parâmetro para poder ser usada nas políticas sem
-- provocar leitura recursiva da tabela.
CREATE OR REPLACE FUNCTION public.is_self_row(p_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       p_id = auth.uid()
       OR (
         btrim(coalesce(auth.jwt() ->> 'email', '')) <> ''
         AND lower(btrim(coalesce(p_email, ''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
       )
     )
$$;

-- is_master(): único perfil com visão entre contratos (dono global).
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE public.is_self_row(up.id, up.email)
      AND upper(btrim(coalesce(up.role, ''))) = 'MASTER'
  )
$$;

-- is_tenant_admin(): ADMIN/MASTER do próprio contrato (gestão de utilizadores).
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE public.is_self_row(up.id, up.email)
      AND (
        coalesce(up.is_admin, false)
        OR upper(btrim(coalesce(up.role, ''))) IN ('ADMIN', 'MASTER')
      )
  )
$$;

-- email_by_username(): a ÚNICA consulta que `anon` pode fazer a
-- user_permissions (login por username antes do signIn). Devolve só o e-mail e
-- só por igualdade exata — não permite listar nem ler o resto da linha.
CREATE OR REPLACE FUNCTION public.email_by_username(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT up.email
  FROM public.user_permissions up
  WHERE btrim(coalesce(p_username, '')) <> ''
    AND lower(btrim(coalesce(up.username, ''))) = lower(btrim(coalesce(p_username, '')))
  LIMIT 1
$$;

SET LOCAL check_function_bodies = on;

REVOKE ALL ON FUNCTION public.get_tenantid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenantid() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenantid() TO authenticated;

REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_self_row(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_master() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_master() TO authenticated;

REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_by_username(text) TO anon, authenticated;

-- O login por username já não faz SELECT na tabela: este índice serve a RPC.
CREATE INDEX IF NOT EXISTS user_permissions_username_lower_idx
  ON public.user_permissions (lower(btrim(coalesce(username, ''))));

-- ============================================================================
-- PASSO 2 — guarda dos campos privilegiados de user_permissions
--   As políticas dão acesso à LINHA, não à COLUNA: sem esta guarda, qualquer
--   utilizador podia fazer UPDATE da própria linha e tornar-se ADMIN, mudar de
--   contrato ou entrar noutro tenant. A guarda corre como owner (SECURITY
--   DEFINER) para poder consultar user_permissions sem reentrar nas políticas.
--   SQL Editor / service_role (auth.uid() nulo) não é afectado.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.guard_user_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_master() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- ADMIN do contrato a provisionar outro utilizador: deixa passar (a
    -- política de INSERT limita o contrato ao dele).
    IF public.is_tenant_admin() AND NOT public.is_self_row(NEW.id, NEW.email) THEN
      RETURN NEW;
    END IF;
    -- Auto-registo público: nunca cria administrador nem entra num contrato.
    -- Sem contrato, o utilizador só recebe dados depois de um admin o vincular.
    NEW.role := 'AUDITOR';
    NEW.is_admin := false;
    NEW.tenantid := '';
    NEW.units := '{}';
    RETURN NEW;
  END IF;

  IF NOT public.is_self_row(OLD.id, OLD.email) THEN
    RETURN NEW; -- gestão de outro utilizador pelo admin do contrato
  END IF;

  -- O app corrige `id` a partir do e-mail no primeiro login; é a única mudança
  -- de chave permitida, e só para o próprio uid do Auth.
  IF NEW.id IS DISTINCT FROM OLD.id AND NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_permissions: o id só pode ser reclamado pelo próprio utilizador'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR coalesce(NEW.is_admin, false) IS DISTINCT FROM coalesce(OLD.is_admin, false)
     OR upper(btrim(coalesce(NEW.role, ''))) IS DISTINCT FROM upper(btrim(coalesce(OLD.role, '')))
     OR NEW.tenantid IS DISTINCT FROM OLD.tenantid
     OR NEW.units IS DISTINCT FROM OLD.units THEN
    RAISE EXCEPTION 'user_permissions: um utilizador não altera o próprio papel, contrato ou permissões'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS user_permissions_guard ON public.user_permissions;
CREATE TRIGGER user_permissions_guard
  BEFORE INSERT OR UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_permissions();

-- ============================================================================
-- PASSO 3 — assets: sai o p_all, entra o contrato (MASTER atravessa)
-- ============================================================================
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.assets;
DROP POLICY IF EXISTS p_tenant_all ON public.assets;
CREATE POLICY p_tenant_all ON public.assets
  FOR ALL TO authenticated
  USING (
    public.is_master()
    OR (
      btrim(coalesce(public.get_tenantid(), '')) <> ''
      AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
    )
  )
  WITH CHECK (
    public.is_master()
    OR (
      btrim(coalesce(public.get_tenantid(), '')) <> ''
      AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
    )
  );

-- Sem política e sem privilégio de tabela: `anon` deixa de ler a base.
REVOKE ALL ON public.assets FROM anon;

-- ============================================================================
-- PASSO 4 — user_permissions: sem anon; cada um na sua linha; admin no contrato
-- ============================================================================
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.user_permissions;
DROP POLICY IF EXISTS p_self_select ON public.user_permissions;
DROP POLICY IF EXISTS p_self_insert ON public.user_permissions;
DROP POLICY IF EXISTS p_self_update ON public.user_permissions;
DROP POLICY IF EXISTS p_admin_all ON public.user_permissions;

CREATE POLICY p_self_select ON public.user_permissions
  FOR SELECT TO authenticated
  USING (public.is_self_row(id, email));

CREATE POLICY p_self_insert ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_self_row(id, email)
    AND (id IS NULL OR id = auth.uid())
  );

CREATE POLICY p_self_update ON public.user_permissions
  FOR UPDATE TO authenticated
  USING (public.is_self_row(id, email))
  WITH CHECK (public.is_self_row(id, email));

-- Gestão de utilizadores: MASTER em qualquer contrato; ADMIN só no seu e nos
-- perfis ainda sem contrato (é assim que um admin vincula um utilizador novo).
CREATE POLICY p_admin_all ON public.user_permissions
  FOR ALL TO authenticated
  USING (
    public.is_master()
    OR (
      public.is_tenant_admin()
      AND (
        btrim(coalesce(tenantid, '')) = ''
        OR (
          btrim(coalesce(public.get_tenantid(), '')) <> ''
          AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
        )
      )
    )
  )
  WITH CHECK (
    public.is_master()
    OR (
      public.is_tenant_admin()
      AND (
        btrim(coalesce(tenantid, '')) = ''
        OR (
          btrim(coalesce(public.get_tenantid(), '')) <> ''
          AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
        )
      )
    )
  );

-- Sem política e sem privilégio de tabela: `anon` deixa de ler a tabela.
REVOKE ALL ON public.user_permissions FROM anon;

-- ============================================================================
-- PASSO 5 — auto-registo: o perfil nasce AUDITOR, sem contrato
-- ----------------------------------------------------------------------------
-- `raw_user_meta_data` é escrito pelo cliente do signUp: qualquer pessoa com a
-- anon key envia role=ADMIN e tenantid=<contrato alheio>. O trigger antigo
-- criava o perfil com esses valores, pelo que o ecrã de registo era uma porta
-- para o contrato de outra pessoa. Aqui o papel, `is_admin`, contrato, filial e
-- unidades são FIXOS; só o username e o nome vêm do metadata (cosméticos).
-- O vínculo ao contrato passa a ser dado por um admin, já com o utilizador
-- criado (política p_admin_all). Uma conta pré-criada pelo admin sem `id`
-- adopta o id do Auth; uma conta já vinculada não é tocada.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  v_username text := coalesce(NULLIF(meta ->> 'username', ''), split_part(coalesce(NEW.email, ''), '@', 1));
BEGIN
  INSERT INTO public.user_permissions (
    id, email, username, name, role, tenantid, filial, units, is_admin
  )
  VALUES (
    NEW.id,
    lower(coalesce(NEW.email, '')),
    v_username,
    coalesce(NULLIF(meta ->> 'name', ''), v_username),
    'AUDITOR',
    '',
    '',
    ARRAY[]::text[],
    false
  )
  ON CONFLICT (email) DO UPDATE SET
    id         = EXCLUDED.id,
    updated_at = now()
  WHERE public.user_permissions.id IS NULL;

  RETURN NEW;
END
$$;

-- Remove variações antigas do mesmo trigger antes de recriar (senão o perfil
-- chegaria a ser gravado duas vezes, uma delas com o metadata do cliente).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user           ON auth.users;
DROP TRIGGER IF EXISTS on_user_created           ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- VERIFICAÇÃO (descomentar depois do COMMIT, é só leitura)
-- ----------------------------------------------------------------------------
-- 0) Auto-registo: o trigger actual não lê papel nem contrato do metadata.
--   select prosrc from pg_proc where proname = 'handle_new_user';  -- sem "->> 'role'"/"->> 'tenantid'"
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'auth.users'::regclass and not tgisinternal;  -- só on_auth_user_created
--
-- 1) Políticas das duas tabelas (nenhuma deve listar `anon`):
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname = 'public' and tablename in ('assets', 'user_permissions')
--    order by 1, 2;
--   -- assets: p_tenant_all {authenticated}
--   -- user_permissions: p_admin_all, p_self_insert/select/update {authenticated}
--
-- 2) `anon` sem privilégio de tabela (0 linhas):
--   select table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('assets', 'user_permissions')
--      and grantee in ('anon', 'PUBLIC');
--
-- 3) Ativos sem contrato — ficam invisíveis para não-MASTER. Corrigir ANTES de
--    aplicar se o número não for 0:
--   select count(*) from public.assets where btrim(coalesce(tenantid, '')) = '';
--
-- 4) Perfis que o login ainda resolve pelo e-mail (id nulo/desalinhado):
--   select count(*) filter (where id is null) as sem_id,
--          count(*) filter (where btrim(coalesce(tenantid, '')) = '') as sem_contrato
--     from public.user_permissions;
--
-- 5) Dono global: só `role = 'MASTER'` atravessa contratos. Se a conta do dono
--    não aparecer aqui, a leitura/download de todos os contratos deixa de
--    funcionar — corrigir com um UPDATE explícito no SQL Editor:
--   select email, role, is_admin, tenantid from public.user_permissions
--    where upper(btrim(coalesce(role, ''))) = 'MASTER';
--
-- 6) Login por username sem sessão (deve devolver o e-mail ou null):
--   select public.email_by_username('nome.de.utilizador');
-- ============================================================================

COMMIT;
