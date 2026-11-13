-- ============================================================================
-- assets.rad_recno — REGISTRO ADOTADO (cópia de dados entre unidades)
-- ============================================================================
-- Quando a plaqueta não existe na unidade em inventário, o auditor pode ver a
-- ficha de um bem de outra unidade e COPIAR os dados para um item novo desta
-- unidade. O registo novo é um registo novo: `sn1_recno` sobe nulo (não se
-- duplica a chave) e o `sn1_recno` da origem fica guardado em `rad_recno`
-- (`rad_` = REGISTRO ADOTADO, `recno` = valor copiado).
--
-- O app envia `rad_recno` no upsert; se a coluna ainda não existir, o laço de
-- PGRST204 remove a coluna do lote e reenvia — a ordem de aplicação não
-- derruba a sincronização.
--
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS rad_recno numeric;

COMMENT ON COLUMN public.assets.rad_recno IS
  'REGISTRO ADOTADO: sn1_recno do registo de origem quando este ativo foi criado copiando os dados de outra unidade';
