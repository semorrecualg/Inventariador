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
-- CAMPANHAS ABERTAS DUPLICADAS: o índice único não pode ser criado com duas
-- campanhas abertas na mesma filial (23505). Em vez de abortar a transação, o
-- script ARQUIVA as excedentes antes do índice — nunca apaga: a linha inteira
-- fica em public._gbr_campaigns_arquivadas_fase1. Sobrevive a campanha ATIVA
-- mais recente (e, entre iguais, a de start_date/created_at mais recente). Para
-- ver os duplicados antes de correr:
--
--   SELECT tenantid, upper(btrim(filial)) AS filial, count(*), string_agg(id::text, ', ')
--   FROM public.campaigns
--   WHERE status IN ('CREATED','ACTIVE') AND filial IS NOT NULL AND btrim(filial) <> ''
--   GROUP BY tenantid, upper(btrim(filial))
--   HAVING count(*) > 1;
--
-- Se a escolha automática não servir, encerre à mão a campanha certa (na app ou
-- com UPDATE) e o bloco de quarentena passa a não ter nada para arquivar.
-- ============================================================================

BEGIN;

-- 1. Filial obrigatória para campanha aberta. NOT VALID evita rejeitar linhas
--    legadas; as gravações novas são verificadas.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_filial_obrigatoria;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_filial_obrigatoria
  CHECK (status NOT IN ('CREATED','ACTIVE') OR (filial IS NOT NULL AND btrim(filial) <> '')) NOT VALID;

-- 2. Resolver as campanhas abertas duplicadas (quarentena auditável).
--    O status passa a ARCHIVED e a linha original fica guardada em jsonb; para
--    repor uma campanha arquivada por engano:
--
--      UPDATE public.campaigns c
--         SET status = b.status
--        FROM public._gbr_campaigns_arquivadas_fase1 b
--       WHERE c.id::text = b.id;
DO $$
DECLARE
  v_id    text;
  v_total integer := 0;
BEGIN
  CREATE TABLE IF NOT EXISTS public._gbr_campaigns_arquivadas_fase1 (
    id           text PRIMARY KEY,
    tenantid     text,
    filial       text,
    status       text,
    linha        jsonb NOT NULL,
    motivo       text NOT NULL,
    arquivada_em timestamptz NOT NULL DEFAULT now()
  );

  -- A partição replica a chave do índice: (tenantid, upper(btrim(filial))).
  -- A ordenação é determinística, para a mesma base produzir sempre o mesmo
  -- resultado: ATIVA primeiro, depois a mais recente.
  FOR v_id IN
    SELECT s.id::text
    FROM (
      SELECT c.id,
             row_number() OVER (
               PARTITION BY c.tenantid, upper(btrim(c.filial))
               ORDER BY (c.status = 'ACTIVE') DESC,
                        c.start_date DESC NULLS LAST,
                        c.created_at DESC NULLS LAST,
                        c.id::text DESC
             ) AS posicao
      FROM public.campaigns c
      WHERE c.status IN ('CREATED','ACTIVE')
        AND c.filial IS NOT NULL
        AND btrim(c.filial) <> ''
    ) s
    WHERE s.posicao > 1
  LOOP
    INSERT INTO public._gbr_campaigns_arquivadas_fase1
      (id, tenantid, filial, status, linha, motivo)
    SELECT c.id::text, c.tenantid, c.filial, c.status, to_jsonb(c),
           'campanha aberta duplicada na mesma filial (Fase 1)'
    FROM public.campaigns c
    WHERE c.id::text = v_id
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.campaigns
       SET status = 'ARCHIVED', updated_at = now()
     WHERE id::text = v_id
       AND status IN ('CREATED','ACTIVE');

    v_total := v_total + 1;
    RAISE NOTICE 'PASSO 1: campanha aberta duplicada % arquivada (linha em public._gbr_campaigns_arquivadas_fase1)', v_id;
  END LOOP;

  IF v_total > 0 THEN
    RAISE NOTICE 'PASSO 1: % campanha(s) aberta(s) duplicada(s) arquivada(s)', v_total;
  END IF;
END $$;

-- 3. Uma só campanha aberta por filial e contrato. A comparação é feita na
--    filial normalizada (aparada e em maiúsculas), a mesma chave do app.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_uma_aberta_por_filial
  ON public.campaigns (tenantid, upper(btrim(filial)))
  WHERE status IN ('CREATED','ACTIVE');

-- 4. Índice de leitura usado pela lista de campanhas por filial.
CREATE INDEX IF NOT EXISTS campaigns_tenant_filial_idx
  ON public.campaigns (tenantid, filial);

COMMIT;
