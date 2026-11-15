-- ============================================================================
-- assets.conferido / auditor / data_leitura — CONFERÊNCIA NA NUVEM
-- ============================================================================
-- Antes: quem conferiu e quando vivia só no SQLite/Dexie do aparelho
-- (`_conferido`, `_auditor`, `_dataLeitura`). O upsert do app envia apenas
-- colunas do schema remoto, e a tabela `assets` não tinha onde guardar isso:
-- ao reinstalar o app ou trocar de telemóvel, o item voltava sem autor nem
-- data de leitura (no máximo o `status` dizia CONFERIDO).
--
-- Estas três colunas fecham esse buraco. O app envia-as sempre que existem; se
-- ainda não existirem, ele remove a coluna do lote e reenvia (PGRST204), por
-- isso a ordem de aplicação não derruba a sincronização.
--
-- `data_leitura` é text (ISO 8601 vindo do app), não timestamptz: há registos
-- legados com datas já gravadas como texto no SQLite e a conversão falharia.
--
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS conferido boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auditor text,
  ADD COLUMN IF NOT EXISTS data_leitura text;

UPDATE public.assets SET conferido = false WHERE conferido IS NULL;

ALTER TABLE public.assets ALTER COLUMN conferido SET DEFAULT false;

-- ----------------------------------------------------------------------------
-- BACKFILL: tudo o que já tem `status = CONFERIDO` na nuvem passa a ter o
-- booleano ligado. O autor e a data não existem na nuvem para os registos
-- antigos — voltam preenchidos a partir da próxima sincronização do aparelho
-- que os conferiu.
-- ----------------------------------------------------------------------------
UPDATE public.assets
   SET conferido = true
 WHERE conferido IS DISTINCT FROM true
   AND (
     UPPER(COALESCE(status, '')) LIKE '%CONFERIDO%'
     OR UPPER(COALESCE(status, '')) = 'SIM'
   );

-- Consulta por unidade conferida é o padrão da tela de CONFERIDOS.
CREATE INDEX IF NOT EXISTS assets_tenant_conferido_idx
  ON public.assets (tenantid, conferido);

-- Conferência
SELECT tenantid,
       count(*) FILTER (WHERE conferido) AS conferidos,
       count(*)                          AS total
  FROM public.assets
 GROUP BY tenantid
 ORDER BY total DESC
 LIMIT 10;
