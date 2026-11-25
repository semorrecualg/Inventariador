-- ============================================================================
-- assets.updated_at — o carimbo da nuvem passa a mudar em cada UPDATE
-- ============================================================================
-- SINTOMA: a conferência feita num aparelho não chega aos outros. O pull delta
-- baixa `updated_at > checkpoint` (src/services/supabaseService.ts ->
-- fetchFullInventory, ETAPA 5b), mas a coluna só tinha `DEFAULT now()`, que
-- vale no INSERT e nunca mais. O upsert da fila e o espelhamento passam a
-- actualizar a linha (conferido, auditor, data_leitura) sem tocar no carimbo —
-- a linha alterada ficava invisível ao delta de todos os aparelhos, e o outro
-- telemóvel continuava a mostrar o ativo como pendente até um pull completo
-- (reinstalar, trocar de unidade).
--
-- CORREÇÃO: trigger BEFORE UPDATE que escreve `NEW.updated_at = now()`, no
-- relógio do servidor. O app NÃO envia `updated_at` de propósito: o relógio do
-- aparelho pode estar adiantado e empurrar o checkpoint do delta para o futuro,
-- e os restantes aparelhos saltavam alterações até esse instante. O carimbo é
-- do servidor, o cliente só lê.
--
-- Idempotente: pode ser executado mais de uma vez.
--
-- Verificação depois de aplicar (somente leitura):
--   select tgname from pg_trigger where tgrelid = 'public.assets'::regclass;
--   -- a lista tem de incluir assets_touch_updated_at
--
--   select count(*) from public.assets where updated_at is null;
--   -- tem de ser 0
-- ============================================================================

-- 1) BACKFILL: linha sem carimbo nunca entra em `updated_at > checkpoint`
--    (importação antiga, ALTER TABLE ADD COLUMN em base legada).
UPDATE public.assets
   SET updated_at = COALESCE(created_at, now())
 WHERE updated_at IS NULL;

ALTER TABLE public.assets ALTER COLUMN updated_at SET DEFAULT now();

-- 2) Função do carimbo. `now()` é o instante da transacção no servidor, o mesmo
--    para todas as linhas do lote — é isso que o pull delta compara.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 3) Trigger idempotente (o Postgres não tem CREATE TRIGGER IF NOT EXISTS).
DROP TRIGGER IF EXISTS assets_touch_updated_at ON public.assets;
CREATE TRIGGER assets_touch_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
