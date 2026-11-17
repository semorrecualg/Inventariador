-- ============================================================================
-- GBR KARDEK – Inventariador · Fase 1: campanha como chave de controlo
-- ----------------------------------------------------------------------------
-- A campanha delimita o inventário de UMA filial. Depois deste script:
--   • campanha aberta (CREATED ou ACTIVE) exige filial preenchida;
--   • só pode existir UMA campanha aberta por (tenantid, filial).
--
-- COMO USAR: Supabase Dashboard → SQL Editor → cole tudo → Run.
-- Rode DEPOIS de docs/supabase_bootstrap.sql.
--
-- IMPORTANTE — o script FALHA DE PROPÓSITO se já houver campanhas abertas
-- duplicadas na mesma filial (o CREATE UNIQUE INDEX aborta a transação). Nada é
-- apagado por aqui: encerre/arquive a campanha errada e rode de novo. Para ver
-- os duplicados antes:
--
--   SELECT tenantid, upper(btrim(filial)) AS filial, count(*), string_agg(id::text, ', ')
--   FROM public.campaigns
--   WHERE status IN ('CREATED','ACTIVE') AND filial IS NOT NULL AND btrim(filial) <> ''
--   GROUP BY tenantid, upper(btrim(filial))
--   HAVING count(*) > 1;
-- ============================================================================

BEGIN;

-- 1. Filial obrigatória para campanha aberta. NOT VALID evita rejeitar linhas
--    legadas; as gravações novas são verificadas.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_filial_obrigatoria;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_filial_obrigatoria
  CHECK (status NOT IN ('CREATED','ACTIVE') OR (filial IS NOT NULL AND btrim(filial) <> '')) NOT VALID;

-- 2. Uma só campanha aberta por filial e contrato. A comparação é feita na
--    filial normalizada (aparada e em maiúsculas), a mesma chave do app.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_uma_aberta_por_filial
  ON public.campaigns (tenantid, upper(btrim(filial)))
  WHERE status IN ('CREATED','ACTIVE');

-- 3. Índice de leitura usado pela lista de campanhas por filial.
CREATE INDEX IF NOT EXISTS campaigns_tenant_filial_idx
  ON public.campaigns (tenantid, filial);

COMMIT;
