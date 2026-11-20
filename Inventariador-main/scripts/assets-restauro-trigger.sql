-- ============================================================================
-- assets.restored_at + trava do servidor contra a RESSURREIÇÃO
-- ============================================================================
-- PROBLEMA: a exclusão já viaja no payload (`is_deleted`, #126), mas quem decide
-- «vivo ou apagado» é o último upsert. Um APK anterior a essa regra (ou uma
-- cópia local antiga num aparelho que nunca recebeu a exclusão) envia
-- `is_deleted = false` sobre uma linha apagada e o ativo volta para todos.
-- O cliente já consulta a nuvem antes de escrever (#128), mas a trava final não
-- pode depender do cliente: um APK antigo não tem essa guarda.
--
-- CORREÇÃO: trigger BEFORE UPDATE em `public.assets` que recusa pôr
-- `is_deleted = false` sobre uma linha apagada, EXCEPTO quando a mesma escrita
-- traz um `restored_at` novo. `restored_at` é a marca explícita de restauro: só
-- o caminho de restauro do app a envia (`syncAssetsToCloud(..., { allowUndelete:
-- true })` em `restoreAsset`).
--
-- Consequências esperadas:
--   · APK antigo que tente reativar → erro claro (P0001) e a linha fica
--     apagada; o app carimba a recusa no ativo em vez de «sincronizar em falso»;
--   · update normal de um ativo apagado (is_deleted continua true) → passa;
--   · restauro pelo app → passa, porque envia `restored_at`.
--
-- Idempotente: pode ser executado mais de uma vez.
--
-- Verificação depois de aplicar (somente leitura):
--   select tgname from pg_trigger where tgrelid = 'public.assets'::regclass;
--   -- tem de incluir assets_bloquear_ressurreicao
--
--   -- teste controlado (rollback no fim, nada fica gravado):
--   begin;
--     update public.assets set is_deleted = false where is_deleted = true and false;
--     -- deve falhar: P0001 exclusão prevalece
--   rollback;
-- ============================================================================

-- 1) A marca explícita de restauro (NULL = nunca restaurado).
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS restored_at timestamptz;

-- 2) A trava.
CREATE OR REPLACE FUNCTION public.assets_bloquear_ressurreicao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_deleted IS TRUE AND NEW.is_deleted IS NOT TRUE THEN
    IF NEW.restored_at IS NULL OR NEW.restored_at IS NOT DISTINCT FROM OLD.restored_at THEN
      RAISE EXCEPTION 'Exclusão prevalece: para pôr is_deleted = false é preciso um restored_at novo (restauro explícito).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_bloquear_ressurreicao ON public.assets;
CREATE TRIGGER assets_bloquear_ressurreicao
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.assets_bloquear_ressurreicao();
