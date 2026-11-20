-- ============================================================================
-- GBR KARDEK — FIX: `log_asset_changes()` gravava NULL em `asset_logs.user_email`
-- ============================================================================
-- SINTOMA (reproduzido com UPDATE + ROLLBACK em 2026-11-20):
--   ERROR: 23502: null value in column "user_email" of relation "asset_logs"
--          violates not-null constraint
--   CONTEXT: INSERT INTO public.asset_logs (asset_id, user_email, action,
--            old_data, new_data, tenant_id)
--            VALUES (NEW.id::text, NEW._auditor, 'UPDATE', ...)
--            PL/pgSQL function log_asset_changes() line 3 at SQL statement
--
-- CAUSA: a função lia `NEW._auditor`, coluna LEGADA (nome vindo da planilha/ERP,
-- com valores como «ADMINISTRADOR GLOBAL»). O app grava `auditor`, sem
-- underscore (`buildPayload` em `src/services/supabaseService.ts` e
-- `processDataSyncQueue` em `src/services/syncService.ts`). Nas linhas em que
-- `_auditor` está nulo o INSERT em `asset_logs` recebia NULL; como este
-- projecto tem `asset_logs.user_email NOT NULL`, a transacção inteira abortava.
-- Consequência: TODA a UPDATE em `public.assets` dessas linhas falhava com
-- 23502 — inclusive o restauro pelo app (a trava `assets_bloquear_ressurreicao`
-- deixa passar, e a auditoria estourava a seguir) e as sincronizações normais.
--
-- É a mesma família do `scripts/fix-asset-audit-triggers-tenantid.sql`: funções
-- de trigger criadas na base (fora do repositório) continuam a referenciar os
-- nomes anteriores à migração (`_tenantid`, `_unitid`, `_auditor`).
--
-- CORREÇÃO: o e-mail passa a ser resolvido por `coalesce`, por ordem:
--   1. `auditor`          — a coluna que o app escreve;
--   2. `_auditor`         — a coluna legada (nome do auditor da planilha);
--   3. JWT (`auth.jwt()`) — quem está autenticado a fazer a escrita;
--   4. `system@gbr.com.br` — o mesmo fallback da função irmã
--      `trg_audit_asset_changes`, para os dois registos da mesma escrita
--      ficarem coerentes.
--
-- A leitura é feita por `to_jsonb(NEW) ->> 'auditor'` em vez de `NEW.auditor`:
-- se a coluna não existir nalguma base, o valor é NULL em vez de rebentar com
-- 42703. A função fica válida nos dois esquemas — e nunca grava NULL.
--
-- NÃO se alivia `asset_logs.user_email` para aceitar NULL: a trilha de auditoria
-- existe para dizer quem fez a escrita, e o `coalesce` garante que sempre diz.
--
-- Idempotente: `CREATE OR REPLACE FUNCTION`, pode ser executado mais de uma vez.
--
-- Verificação depois de aplicar (somente leitura no fim):
--   -- 1) que trigger chama o quê
--   select t.tgname, p.proname
--     from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--    where t.tgrelid = 'public.assets'::regclass and not t.tgisinternal
--    order by 1;
--
--   -- 2) a escrita passa e a auditoria grava quem fez (reverte tudo no fim)
--   begin;
--     create temp table _alvo on commit drop as
--       select id from public.assets limit 1;
--     update public.assets set _auditor = null
--      where id = (select id from _alvo);
--     select action, user_email, created_at
--       from public.asset_logs order by created_at desc limit 3;
--   rollback;
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_asset_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.asset_logs (asset_id, user_email, action, old_data, new_data, tenant_id)
  VALUES (
    NEW.id::text,
    coalesce(
      nullif(btrim(to_jsonb(NEW) ->> 'auditor'), ''),   -- coluna do app
      nullif(btrim(to_jsonb(NEW) ->> '_auditor'), ''),  -- coluna legada
      nullif(btrim(auth.jwt() ->> 'email'), ''),        -- quem está autenticado
      'system@gbr.com.br'                               -- fallback da função irmã
    ),
    'UPDATE',
    to_jsonb(OLD),
    to_jsonb(NEW),
    NEW.tenantid
  );
  RETURN NEW;
END;
$$;
