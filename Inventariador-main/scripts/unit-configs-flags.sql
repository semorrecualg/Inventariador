-- ============================================================================
-- unit_configs.flags — FLAGS DE POLÍTICA DA UNIDADE NA NUVEM
-- ============================================================================
-- Antes: as flags por filial (hasGps, exigir NF, exigir seriado, exigir
-- plaqueta, permitir novo ativo, permitir baixa) viviam só no SQLite/Dexie do
-- aparelho. A tabela `unit_configs` não tinha onde as guardar, então trocar de
-- dispositivo mostrava a filial "sem regras".
--
-- As flags vão num jsonb `flags`, o mesmo padrão de `inventory_config.data`.
-- Os nomes ficam em camelCase (hasGps, requireNf...) porque são os do tipo
-- `UnitConfig`; como colunas do Postgres viriam em minúsculas.
--
-- A âncora GPS continua a viajar em `inventory_config` (tenantid + filial,
-- payload em `data`). Aqui fica o contrato de política da unidade.
--
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================================

ALTER TABLE public.unit_configs
  ADD COLUMN IF NOT EXISTS flags jsonb DEFAULT '{}'::jsonb;

UPDATE public.unit_configs SET flags = '{}'::jsonb WHERE flags IS NULL;

ALTER TABLE public.unit_configs ALTER COLUMN flags SET DEFAULT '{}'::jsonb;

-- A chave (tenantid, filial) já é única desde o bootstrap
-- (índice unit_configs_tenant_filial_key) — é o alvo do upsert do app.
CREATE UNIQUE INDEX IF NOT EXISTS unit_configs_tenant_filial_key
  ON public.unit_configs (tenantid, filial);

-- ----------------------------------------------------------------------------
-- BACKFILL: quem já tem âncora gravada em `inventory_config` ganha a linha de
-- flags agora (hasGps = true), sem esperar novo salvamento no app. O merge
-- `||` preserva qualquer flag que já exista na linha.
-- ----------------------------------------------------------------------------
INSERT INTO public.unit_configs (
  tenantid, filial, unit_id, lat, lng, radius_meters, is_active,
  updated_by, updated_at, flags
)
SELECT ic.tenantid,
       ic.filial,
       ic.filial,
       COALESCE(NULLIF(ic.data->>'lat', '')::numeric, 0),
       COALESCE(NULLIF(ic.data->>'lng', '')::numeric, 0),
       COALESCE(NULLIF(ic.data->>'radius_meters', '')::numeric, 0),
       COALESCE((ic.data->>'is_active')::boolean, true),
       COALESCE(ic.data->>'updated_by', 'backfill'),
       COALESCE(ic.updated_at, now()),
       jsonb_build_object('hasGps', true)
  FROM public.inventory_config ic
 WHERE ic.filial IS NOT NULL
   AND ic.data IS NOT NULL
   AND COALESCE(NULLIF(ic.data->>'lat', '')::numeric, 0) <> 0
   AND COALESCE(NULLIF(ic.data->>'lng', '')::numeric, 0) <> 0
ON CONFLICT (tenantid, filial) DO UPDATE
   SET flags      = COALESCE(public.unit_configs.flags, '{}'::jsonb) || EXCLUDED.flags,
       lat        = EXCLUDED.lat,
       lng        = EXCLUDED.lng,
       unit_id    = EXCLUDED.unit_id,
       updated_at = GREATEST(public.unit_configs.updated_at, EXCLUDED.updated_at);

-- Conferência
SELECT tenantid, filial, flags, updated_at
  FROM public.unit_configs
 ORDER BY updated_at DESC NULLS LAST
 LIMIT 20;
