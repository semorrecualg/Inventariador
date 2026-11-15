-- ============================================================================
-- assets.rad_recno — REGISTRO ADOTADO (cópia de dados entre unidades)
-- ============================================================================
-- Quando a plaqueta não existe na unidade em inventário, o auditor pode ver a
-- ficha de um bem de outra unidade e COPIAR os dados para um item novo desta
-- unidade. O registo novo é um registo novo: `sn1_recno` sobe nulo (não se
-- duplica a chave) e o registo recebe uma identidade própria em `rad_recno`,
-- `registro` e `subreg`:
--
--     rad_<UNIDADE>_<DISPOSITIVO>_<000001>   -> rad_recno e registro
--     ex.: rad_010101_7K3F_000001
--
-- A unidade e o código curto da instalação (4 caracteres, estável por
-- aparelho) impedem que dois aparelhos ou duas unidades emitam o mesmo rótulo;
-- a sequência vem do contador persistido + dos rótulos já na base. `subreg` é
-- sempre 0001 porque cada cópia abre um registro novo.
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

-- Se a coluna foi criada por uma versão anterior como `numeric`, converta-a
-- (o rótulo é texto). Só é preciso uma vez; o ALTER abaixo é seguro se a coluna
-- já for text:
-- ALTER TABLE public.assets ALTER COLUMN rad_recno TYPE text USING rad_recno::text;

-- NÃO altere `sn1_recno`/`sn3_recno`: são numéricos (chave do ERP e base do
-- guardião `tenantid + filial + sn1_recno`).

COMMENT ON COLUMN public.assets.rad_recno IS
  'REGISTRO ADOTADO: rótulo rad_<UNIDADE>_<DISPOSITIVO>_<SEQUENCIA> do ativo criado copiando os dados de outra unidade';
