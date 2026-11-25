-- ============================================================================
-- GBR KARDEK — Privacidade do bucket asset-photos e do Kardex público
-- ----------------------------------------------------------------------------
-- Fecha a exposição pública do bucket `asset-photos`: bucket privado, objectos
-- acessíveis só por URL assinada e só dentro da pasta do tenant do utilizador
-- autenticado (photos/{tenantid}/...). Remove também a política p_all da tabela
-- `asset-photos`, que hoje deixa `anon` ler e escrever tudo.
--
-- Depende de public.get_tenantid() (user_permissions.id = auth.uid()), criada
-- aqui de forma idempotente para não depender de outro script.
--
-- Como usar: colar o ficheiro inteiro no SQL Editor do Supabase. Se falhar, a
-- transacção reverte tudo. Pode ser executado mais de uma vez.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASSO 1 — get_tenantid() (idempotente)
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

REVOKE ALL ON FUNCTION public.get_tenantid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenantid() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenantid() TO authenticated;

-- ============================================================================
-- PASSO 2 — bucket privado (cria se não existir; nunca volta a público)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-photos', 'asset-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ============================================================================
-- PASSO 3 — storage.objects: quatro políticas, uma por operação.
--   Estrutura do caminho: photos/{tenantid}/{assetId}/{ficheiro}
--   Comparação sem distinção de maiúsculas porque o app grava o tenant ora a
--   partir do perfil, ora do registo local.
-- ============================================================================
DROP POLICY IF EXISTS p_asset_photos_tenant_select ON storage.objects;
CREATE POLICY p_asset_photos_tenant_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_insert ON storage.objects;
CREATE POLICY p_asset_photos_tenant_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_update ON storage.objects;
CREATE POLICY p_asset_photos_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  )
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_delete ON storage.objects;
CREATE POLICY p_asset_photos_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

-- ============================================================================
-- PASSO 4 — tabela asset-photos: sai o p_all, entra o filtro por tenant
-- ============================================================================
DROP POLICY IF EXISTS p_all ON public."asset-photos";
DROP POLICY IF EXISTS p_tenant_all ON public."asset-photos";
CREATE POLICY p_tenant_all ON public."asset-photos"
  FOR ALL TO authenticated
  USING (lower(tenantid) = lower(public.get_tenantid()))
  WITH CHECK (lower(tenantid) = lower(public.get_tenantid()));

-- ============================================================================
-- PASSO 5 — backups automáticos legados: backups/{userId}/... ->
--           photos/{tenantid}/backups/{userId}/...
--   Sem isto, os backups antigos deixam de ser alcançáveis por política
--   (ficam no bucket, mas fora de qualquer pasta de tenant).
-- ============================================================================
UPDATE storage.objects o
SET name = 'photos/' || up.tenantid || '/backups/'
           || split_part(o.name, '/', 2) || '/' || split_part(o.name, '/', 3)
FROM public.user_permissions up
WHERE o.bucket_id = 'asset-photos'
  AND o.name LIKE 'backups/%'
  AND up.id::text = split_part(o.name, '/', 2);

-- ============================================================================
-- VERIFICAÇÃO (descomentar depois do COMMIT, é só leitura):
--   select id, public from storage.buckets where id = 'asset-photos';       -- public = false
--   select policyname, cmd, roles from pg_policies
--     where schemaname = 'storage' and tablename = 'objects';                -- 4 p_asset_photos_*
--   select count(*) from storage.objects
--     where bucket_id = 'asset-photos' and name like 'backups/%';           -- deve ser 0
--   select policyname from pg_policies
--     where schemaname = 'public' and tablename = 'asset-photos';           -- só p_tenant_all
-- ============================================================================

COMMIT;
