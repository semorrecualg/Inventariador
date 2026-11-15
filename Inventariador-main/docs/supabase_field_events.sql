-- ============================================================================
-- field_events — O LOG DE CAMPO NA NUVEM (F1.3/F2)
-- ============================================================================
-- Antes: `field_events` vivia só no aparelho (Dexie v8). Reinstalar a app,
-- limpar dados ou trocar de telemóvel apagava a trilha de conferência sem
-- deixar rasto — e o recibo de sync só provava os ativos, não as leituras.
--
-- Esta tabela é a cópia independente do log. O app envia por `upsert` com
-- `onConflict: 'event_id'` + `ignoreDuplicates: true`: reenviar o mesmo evento
-- não cria linha nem falha, o que torna a retomada de um ciclo seguro. Só
-- depois da confirmação é que o aparelho marca `_synced = 1`.
--
-- SÓ-ADIÇÃO: os gatilhos abaixo recusam UPDATE e DELETE. Não é decoração — é a
-- diferença entre "registro do que aconteceu" e "registro do que se quer que
-- tenha acontecido". O único campo que muda no aparelho é `_synced`, que nem
-- chega a ser enviado (a coluna não existe aqui de propósito).
--
-- `event_id` é text (UUID gerado no aparelho) e não uuid: a chave de
-- idempotência tem de sobreviver a qualquer geração futura, e text não rejeita
-- um id legado nem obriga a cast no PostgREST.
--
-- Idempotente: pode ser executado mais de uma vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.field_events (
  event_id      text        PRIMARY KEY,
  tenantid      text        NOT NULL,
  filial        text        NOT NULL DEFAULT 'GERAL',
  device_id     text        NOT NULL,
  auditor       text        NOT NULL,
  event_type    text        NOT NULL,
  asset_key     text,
  territory_key text,
  lamport       bigint      NOT NULL,
  occurred_at   timestamptz NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     text,
  hash          text,
  -- Um aparelho não pode ter dois eventos com o mesmo contador lógico: se
  -- acontecer, o envio está a reutilizar números e a ordem deixa de ser
  -- determinística. A restrição apanha-o na nuvem, não meses depois.
  CONSTRAINT field_events_device_lamport_unico UNIQUE (tenantid, device_id, lamport),
  CONSTRAINT field_events_tipo_conhecido CHECK (
    event_type IN ('LEITURA', 'DIVERGENCIA', 'ETIQUETA', 'FOTO', 'ASSINATURA', 'POSSE', 'CORRECAO')
  )
);

-- Leituras típicas: a trilha de um ativo, a do aparelho e a janela do turno.
CREATE INDEX IF NOT EXISTS field_events_asset_idx
  ON public.field_events (tenantid, asset_key, lamport);
CREATE INDEX IF NOT EXISTS field_events_device_idx
  ON public.field_events (tenantid, device_id, lamport);
CREATE INDEX IF NOT EXISTS field_events_tempo_idx
  ON public.field_events (tenantid, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- SÓ-ADIÇÃO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.field_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'field_events é só-adição: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS field_events_no_update ON public.field_events;
CREATE TRIGGER field_events_no_update
  BEFORE UPDATE ON public.field_events
  FOR EACH ROW EXECUTE FUNCTION public.field_events_append_only();

DROP TRIGGER IF EXISTS field_events_no_delete ON public.field_events;
CREATE TRIGGER field_events_no_delete
  BEFORE DELETE ON public.field_events
  FOR EACH ROW EXECUTE FUNCTION public.field_events_append_only();

-- ----------------------------------------------------------------------------
-- RLS — mesmo contrato das restantes tabelas do app (`p_all`), para o envio
-- não passar a falhar por política num ambiente onde as outras já existem.
-- O isolamento por contrato é o mesmo do resto: vem da sessão e do `tenantid`
-- enviado, não de uma política por linha.
-- ----------------------------------------------------------------------------
ALTER TABLE public.field_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.field_events;
CREATE POLICY p_all ON public.field_events
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.field_events IS
  'Log de eventos de campo (só-adição). Chave de idempotência: event_id.';
