-- ============================================================================
-- assets.is_deleted — a EXCLUSÃO passa a subir para a nuvem
-- ============================================================================
-- SINTOMA: apagar um ativo num aparelho não o apagava em mais lado nenhum. O
-- app fazia soft delete (`_is_deleted = 1`) e escondia a linha no ecrã, mas a
-- tabela `assets` não tinha onde guardar a flag: o upsert só envia colunas do
-- schema remoto, a linha da nuvem ficava intacta e o pull seguinte devolvia-a
-- como ativa — o ativo «ressuscitava» no outro telemóvel e, ao reiniciar, no
-- próprio aparelho que o apagou.
--
-- CORREÇÃO: coluna `is_deleted boolean` (false por omissão) que viaja no
-- payload (`scripts/../src/services/supabaseService.ts` -> buildPayload e
-- `src/services/syncService.ts` -> processDataSyncQueue) e volta no pull
-- (`mapCloudAssetRow`). A linha NÃO é apagada da nuvem: fica marcada, para o
-- restauro e a auditoria continuarem possíveis, e para a exclusão poder ser
-- replicada a quem ainda não a viu.
--
-- Idempotente: pode ser executado mais de uma vez.
--
-- Verificação depois de aplicar (somente leitura):
--   select is_deleted, count(*) from public.assets group by 1;
--   -- duas linhas: false (ativos) e true (excluídos)
-- ============================================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

UPDATE public.assets SET is_deleted = false WHERE is_deleted IS NULL;

ALTER TABLE public.assets ALTER COLUMN is_deleted SET DEFAULT false;
