-- ============================================================================
-- inventory_config.excluded_accounts — contas contábeis excluídas (CONTRATO)
-- ----------------------------------------------------------------------------
-- `excludedAccounts` passou a ser configuração de contrato: sai do aparelho e
-- viaja em `inventory_config` para que um aparelho novo respeite as exclusões.
-- Rodar ANTES de publicar a versão que envia a coluna; sem ela o upsert da
-- configuração falha com "column excluded_accounts does not exist".
-- ============================================================================

alter table public.inventory_config
  add column if not exists excluded_accounts jsonb not null default '[]'::jsonb;

comment on column public.inventory_config.excluded_accounts is
  'Contas contábeis ignoradas na carga (governação do contrato).';
