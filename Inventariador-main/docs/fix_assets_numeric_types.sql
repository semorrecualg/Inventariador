-- ============================================================================
-- GBR v2.6 — FIX: tipos numéricos da tabela `assets` (v2, idempotente)
-- ----------------------------------------------------------------------------
-- Sintoma original:  Falha no upsert: invalid input syntax for type integer: "0.956"
--                    (colunas numéricas criadas como integer na tabela real)
-- Erro na v1:        column "gps_lat" does not exist
--                    (as colunas de GPS não existem na tabela real — o
--                     bootstrap as prevê, mas a tabela foi criada sem elas)
--
-- Este script é IDEMPOTENTE: pode rodar quantas vezes quiser.
--  - Converte integer -> numeric preservando os dados;
--  - Cria gps_lat/gps_lng se não existirem e garante o tipo decimal.
-- ============================================================================

-- 1) Colunas numéricas do espelhamento de ativos (aceitam decimal)
ALTER TABLE public.assets
  ALTER COLUMN vlraquisic TYPE numeric(18,2) USING vlraquisic::numeric(18,2),
  ALTER COLUMN qt         TYPE numeric      USING qt::numeric,
  ALTER COLUMN sn1_recno  TYPE numeric      USING sn1_recno::numeric,
  ALTER COLUMN sn3_recno  TYPE numeric      USING sn3_recno::numeric;

-- 2) GPS da âncora: cria se não existir (ADD COLUMN IF NOT EXISTS) e garante
--    o tipo decimal — não quebra se as colunas já existirem com outro tipo.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS gps_lat numeric(18,10);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS gps_lng numeric(18,10);
ALTER TABLE public.assets
  ALTER COLUMN gps_lat TYPE numeric(18,10) USING gps_lat::numeric(18,10),
  ALTER COLUMN gps_lng TYPE numeric(18,10) USING gps_lng::numeric(18,10);

-- 3) Verificação: rode e confirme que as 6 colunas viraram numeric
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'assets'
  AND column_name IN ('vlraquisic','qt','sn1_recno','sn3_recno','gps_lat','gps_lng')
ORDER BY column_name;
