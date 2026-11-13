-- ============================================================================
-- assets.rad_recno — REGISTRO ADOTADO (cópia de dados entre unidades)
-- ============================================================================
-- Quando a plaqueta não existe na unidade em inventário, o auditor pode ver a
-- ficha de um bem de outra unidade e COPIAR os dados para um item novo desta
-- unidade. O registo novo é um registo novo: `sn1_recno` sobe nulo (não se
-- duplica a chave) e o registo recebe uma identidade própria em `rad_recno`,
-- `registro` e `subreg`:
--
--     rad_000001, rad_000002, ...   -> rad_recno e registro (mesmo rótulo)
--     subreg = 0001, 0002, ...      -> sub-itens do mesmo registro
--
-- Assim o registo adotado fica identificado mesmo quando o utilizador esquece
-- de preencher `sn1_recno` na origem.
--
-- O app envia `rad_recno` no upsert; se a coluna ainda não existir, o laço de
-- PGRST204 remove a coluna do lote e reenvia — a ordem de aplicação não
-- derruba a sincronização.
--
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS rad_recno text;

COMMENT ON COLUMN public.assets.rad_recno IS
  'REGISTRO ADOTADO: rótulo rad_NNNNNN (rad_ = REGISTRO ADOTADO + sequência) do ativo criado copiando os dados de outra unidade';
