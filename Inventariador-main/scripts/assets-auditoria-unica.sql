-- ============================================================================
-- public.assets — uma só linha de auditoria por alteração
-- ============================================================================
-- SINTOMA: cada UPDATE em `public.assets` grava DUAS linhas em `public.asset_logs`.
-- Dois triggers na mesma tabela chamam duas funções de auditoria:
--   · `log_asset_changes`          → grava uma linha em asset_logs;
--   · `trg_audit_asset_changes`    → grava a mesma alteração outra vez.
-- A trilha fica com pares de linhas idênticas (mesmo ativo, mesma acção, mesmo
-- instante), o que dobra o ruído da Auditoria e faz qualquer contagem por
-- `asset_logs` valer o dobro. Em conferência feita pelo app há ainda uma
-- terceira linha, do próprio cliente (`auditService.logAssetChange`), que fica
-- — essa é a trilha de campo, não é trigger.
--
-- CORREÇÃO: fica UM só escritor no servidor, `trg_audit_asset_changes`, que
-- cobre CREATE/UPDATE/DELETE, lê o e-mail do JWT e grava `timestamp`.
-- `log_asset_changes` é aposentada como pass-through:
--   · os triggers que a chamam são removidos (o nome do trigger varia por base,
--     por isso a remoção é por função, não por nome);
--   · a função passa a devolver NEW (ou OLD em DELETE, para não bloquear a
--     remoção física) e deixa de escrever em asset_logs.
-- Assim, se alguma base antiga voltar a criar um trigger para essa função, ele
-- não duplica a trilha.
--
-- TRAVA DE SEGURANÇA: se houver duplicados para remover e a função canónica
-- `trg_audit_asset_changes` não existir, o script ABORTA. Sem ela, remover o
-- segundo escritor deixaria asset_logs sem trilha automática nenhuma.
--
-- Idempotente: pode ser executado mais de uma vez.
--
-- Verificação depois de aplicar (somente leitura):
--   select t.tgname, p.proname
--     from pg_trigger t
--     join pg_proc p on p.oid = t.tgfoid
--    where t.tgrelid = 'public.assets'::regclass
--      and not t.tgisinternal;
--   -- nenhuma linha com proname = 'log_asset_changes'
--
--   -- prova com rollback (nada fica gravado):
--   begin;
--     update public.assets set status = status where primarykey = '<uma chave>';
--     select count(*) from public.asset_logs where record_id = '<uma chave>';
--     -- tem de ser 1
--   rollback;
-- ============================================================================

BEGIN;

-- 1) Fora com o segundo escritor. A remoção é por FUNÇÃO (join em pg_proc):
--    o nome do trigger e os argumentos variam entre bases, e é a função que
--    define quem escreve em asset_logs.
DO $$
DECLARE
  r record;
  removidos int := 0;
  canonica_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'trg_audit_asset_changes'
  ) INTO canonica_existe;

  FOR r IN
    SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgrelid = 'public.assets'::regclass
       AND NOT t.tgisinternal
       AND p.proname = 'log_asset_changes'
  LOOP
    IF NOT canonica_existe THEN
      RAISE EXCEPTION
        'trg_audit_asset_changes ausente: remover log_asset_changes deixaria public.asset_logs sem trilha automática.';
    END IF;

    EXECUTE format('DROP TRIGGER %I ON public.assets', r.tgname);
    removidos := removidos + 1;
    RAISE NOTICE 'Trigger % removido: asset_logs fica com um só escritor.', r.tgname;
  END LOOP;

  IF removidos = 0 THEN
    RAISE NOTICE 'Nenhum trigger de log_asset_changes em public.assets (já limpo).';
  END IF;
END $$;

-- 2) Aposenta a função. Só a versão sem argumentos é substituída; se a base
--    tiver uma variante com argumentos, o NOTICE avisa e a remoção do trigger
--    acima já resolveu a duplicação.
DO $$
BEGIN
  IF to_regprocedure('public.log_asset_changes()') IS NULL THEN
    RAISE NOTICE 'log_asset_changes() não existe nesta base: nada a aposentar.';
  ELSE
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.log_asset_changes()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $corpo$
      BEGIN
        -- Pass-through: a trilha é escrita por trg_audit_asset_changes.
        -- DELETE devolve OLD para não bloquear a remoção física da linha.
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $corpo$;
    $sql$;
    RAISE NOTICE 'log_asset_changes() aposentada (pass-through, sem escrita em asset_logs).';
  END IF;
END $$;

COMMIT;
