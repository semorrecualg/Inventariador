-- ============================================================================
-- GBR KARDEK — FIX: triggers de auditoria apontam para colunas legadas
-- ----------------------------------------------------------------------------
-- SINTOMA (reproduzido com INSERT + ROLLBACK):
--   ERROR: 42703: record "new" has no field "_tenantid"
--   CONTEXT: INSERT INTO asset_logs (asset_id, user_email, action, new_data,
--            tenant_id, timestamp) VALUES (..., NEW._tenantid, NOW())
--            PL/pgSQL function trg_audit_asset_changes() line 24
--
-- CAUSA: `scripts/migrate-tenantid-supabase.sql` renomeou `_tenantid` -> `tenantid`
-- (e `_unitid` -> `filial`) mas as funções de trigger criadas na base ficaram a
-- referenciar os nomes antigos. Como `trg_asset_audit` é AFTER INSERT em
-- `public.assets`, TODA inserção/upsert aborta — o espelhamento em massa termina
-- com "0 ativos sincronizados, 12636 rejeitados", citando asset_logs.
--
-- O QUE FAZ (idempotente):
--   1) garante em asset_logs as colunas do payload do trigger;
--   2) reescreve as funções de auditoria trocando as referências legadas
--      (NEW/OLD._tenantid -> .tenantid, NEW/OLD._unitid -> .filial).
--
-- COMO VALIDAR DEPOIS:
--   BEGIN;
--   INSERT INTO public.assets (tenantid, id, primarykey, filial, etiqueta, status)
--   VALUES ('CICOPAL', gen_random_uuid(), 'TESTE-TRIGGER-1', 'MATRIZ', 'TESTE-TRIGGER-1', 'PENDENTE');
--   ROLLBACK;
-- ============================================================================

BEGIN;

-- 1) Colunas que o trigger grava em asset_logs (payload real reproduzido no erro)
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 2) Reescreve as funções de auditoria para o contrato canónico
DO $$
DECLARE
  r record;
  def text;
  novo text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('trg_audit_asset_changes', 'log_asset_changes')
  LOOP
    def := pg_get_functiondef(r.oid);
    novo := def;
    novo := replace(novo, 'NEW._tenantid',  'NEW.tenantid');
    novo := replace(novo, 'OLD._tenantid',  'OLD.tenantid');
    novo := replace(novo, 'NEW."_tenantid"', 'NEW.tenantid');
    novo := replace(novo, 'OLD."_tenantid"', 'OLD.tenantid');
    novo := replace(novo, 'NEW._unitid',    'NEW.filial');
    novo := replace(novo, 'OLD._unitid',    'OLD.filial');
    novo := replace(novo, 'NEW."_unitid"',  'NEW.filial');
    novo := replace(novo, 'OLD."_unitid"',  'OLD.filial');

    IF novo <> def THEN
      EXECUTE novo;
      RAISE NOTICE 'Função % reescrita para tenantid/filial.', r.proname;
    ELSE
      RAISE NOTICE 'Função % já não referencia colunas legadas.', r.proname;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 3) Verificação: deve devolver 0 linhas
SELECT p.proname, 'ainda referencia coluna legada' AS problema
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('trg_audit_asset_changes', 'log_asset_changes')
  AND (pg_get_functiondef(p.oid) LIKE '%_tenantid%' OR pg_get_functiondef(p.oid) LIKE '%_unitid%');
