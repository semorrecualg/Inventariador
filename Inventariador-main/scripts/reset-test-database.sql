-- ============================================================================
-- GBR KARDEK · Inventariador — RESET DA BASE DE TESTE (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- ATENÇÃO: ESTE SCRIPT APAGA DADOS. Use APENAS no projeto de TESTE.
--
-- O que faz, por ordem:
--   1. Confirma que quem corre sabe o que está a fazer (guarda explícita).
--   2. Esvazia as tabelas de inventário/auditoria que existirem (as que não
--      existirem são ignoradas, sem erro).
--   3. Reconstrói a chave primária e os índices canónicos da tabela `assets`
--      (remove índices antigos/mal formados que impediam a chave do ERP).
--   4. REINDEX + ANALYZE, para as estatísticas e os índices ficarem limpos.
--   5. Corre as validações pós-reset (contagens, chaves mal formadas,
--      duplicados pela identidade do ERP).
--
-- O que NÃO faz:
--   - Não toca em `auth.users` (logins) nem em `user_permissions` por omissão
--     (ver passo 2-B; apagar `user_permissions` tranca todos os utilizadores).
--   - Não carrega a planilha: a carga é feita no app (Carga de Dados), depois
--     de limpar a base LOCAL do dispositivo (ver § USO, passo 3).
--
-- ============================================================================
-- USO
-- ----------------------------------------------------------------------------
-- 1) No Supabase Dashboard → SQL Editor → New query, cole este ficheiro.
-- 2) Descomente a linha do passo 0 e rode-a primeiro (isolada), para autorizar:
--        select set_config('gbr.reset_test', 'SIM-TENHO-CERTEZA', false);
--    Sem essa autorização o script aborta com uma mensagem — é a protecção
--    contra correr isto no projeto errado.
-- 3) No dispositivo, antes de reimportar:
--        a. Gestor de Base → limpar a base local (ou limpar os dados do site);
--        b. no DevTools → Application → Local Storage, remover as flags
--           `app_migrate_asset_keys_erp_v1` e
--           `app_repair_fiscal_account_resync_v1`;
--        c. só depois correr a Carga de Dados.
--    Sem o passo 3, a base local antiga reenvia chaves antigas e volta a criar
--    duplicados na nuvem — o reset perde o efeito.
-- 4) Depois da carga, corra o bloco § 5 (VALIDAÇÕES PÓS-CARGA).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. AUTORIZAÇÃO (passo separado, descomente e rode antes)
-- ----------------------------------------------------------------------------
-- select set_config('gbr.reset_test', 'SIM-TENHO-CERTEZA', false);

begin;

do $$
begin
  if current_setting('gbr.reset_test', true) is distinct from 'SIM-TENHO-CERTEZA' then
    raise exception
      'Reset bloqueado: falta autorização. Rode primeiro, nesta sessão: select set_config(''gbr.reset_test'', ''SIM-TENHO-CERTEZA'', false);';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. ESVAZIAR AS TABELAS DE INVENTÁRIO / AUDITORIA
--    `restart identity` reinicia o bigint de audit_logs; `cascade` remove o que
--    depender por FK. Tabelas inexistentes são ignoradas.
-- ----------------------------------------------------------------------------
do $$
declare
  alvo text;
begin
  foreach alvo in array array[
    'assets',
    'asset_logs',
    'asset-photos',
    'asset_movements',
    'asset_depreciation_history',
    'asset_groups',
    'chart_of_accounts',
    'ncm_classifiers',
    'locations',
    'inventory_config',
    'unit_configs',
    'campaigns',
    'campaign_snapshots',
    'log_inventario_termico',
    'field_events',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', alvo)) is not null then
      execute format('truncate table public.%I restart identity cascade', alvo);
      raise notice 'truncada: public.%', alvo;
    else
      raise notice 'ignorada (não existe): public.%', alvo;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2-B. UTILIZADORES (OPCIONAL — descomente só se quiser recriar os perfis)
--      Apagar `user_permissions` remove os perfis (ADMIN/MASTER/…). Os logins
--      em `auth.users` não são tocados nem devem ser: sem eles ninguém entra.
-- ----------------------------------------------------------------------------
-- truncate table public.user_permissions cascade;
-- alter table public.user_permissions enable row level security;  -- se aplicável

-- ----------------------------------------------------------------------------
-- 3. RECONSTRUIR A CHAVE E OS ÍNDICES DE `assets`
--    A base vinha com um índice global em `primarykey` e uma PK só em `id`,
--    ambos incompatíveis com a chave do ERP (`tenantid + primarykey`) e com a
--    coexistência de contratos. Aqui ficam os canónicos.
-- ----------------------------------------------------------------------------
-- 3.1 Índices antigos / mal formados
drop index if exists public.assets_primarykey_key;

-- 3.2 PK composta (tenantid, id) — alvo do upsert `onConflict: 'tenantid, id'`
do $$
declare
  pk_name text;
begin
  select conname into pk_name
  from pg_constraint
  where conrelid = 'public.assets'::regclass
    and contype = 'p';

  -- `cascade` só é preciso se alguma tabela tiver FK para assets(id); nesse
  -- caso a FK também cai (a base está vazia, é um reset de teste).
  if pk_name is not null then
    execute format('alter table public.assets drop constraint %I cascade', pk_name);
    raise notice 'PK antiga removida: %', pk_name;
  end if;

  execute 'alter table public.assets add primary key (tenantid, id)';
  raise notice 'PK recriada: assets(tenantid, id)';
end $$;

-- 3.3 Unicidade da chave de origem POR CONTRATO (é o que impede duas linhas
--     com o mesmo primarykey no mesmo tenantid e garante o upsert idempotente)
create unique index if not exists assets_tenant_primarykey_key
  on public.assets (tenantid, primarykey)
  where primarykey is not null;

-- 3.4 Índices de leitura usados pelo app
create index if not exists assets_tenantid_idx          on public.assets (tenantid);
create index if not exists assets_tenant_filial_idx     on public.assets (tenantid, filial);
create index if not exists assets_tenant_registro_idx   on public.assets (tenantid, registro, subreg);

-- 3.5 Outras tabelas: unicidade que o app assume nos upserts
create unique index if not exists inventory_config_tenant_filial_key
  on public.inventory_config (tenantid, filial);
create unique index if not exists unit_configs_tenant_filial_key
  on public.unit_configs (tenantid, filial);
create unique index if not exists locations_name_tenantid_key
  on public.locations (name, tenantid);
-- `user_permissions` NÃO é esvaziada por omissão, por isso não se recria aqui o
-- índice de email: se existirem dois emails que só diferem na caixa, o
-- `create unique index` falharia e abortaria a transacção toda. Fica para a
-- tarefa de hardening dos perfis.

-- 3.6 REINDEX + estatísticas limpas
reindex table public.assets;
analyze public.assets;
analyze public.audit_logs;

commit;

-- ----------------------------------------------------------------------------
-- 4. RESUMO DO QUE FICOU
-- ----------------------------------------------------------------------------
select 'assets' as tabela, count(*) as linhas from public.assets
union all select 'audit_logs', count(*) from public.audit_logs
union all select 'asset_logs', count(*) from public.asset_logs
union all select 'inventory_config', count(*) from public.inventory_config
union all select 'unit_configs', count(*) from public.unit_configs
union all select 'campaigns', count(*) from public.campaigns
order by tabela;

-- ----------------------------------------------------------------------------
-- 5. VALIDAÇÕES PÓS-CARGA
--    Rode depois da Carga de Dados. Todas devem devolver 0 linhas, excepto a
--    primeira (que só mostra o volume).
-- ----------------------------------------------------------------------------
-- 5.1 Volume por contrato e unidade — confira contra a planilha
select tenantid,
       substring(coalesce(filial, '') from '^[0-9]+') as filial_codigo,
       count(*) as linhas
from public.assets
group by 1, 2
order by 1, 2;

-- 5.2 Chaves fora do formato do ERP (`código da filial + registro + subreg`)
--     Esperado: 0 linhas. Se aparecerem, a carga entrou por caminho antigo.
select tenantid, primarykey, filial, registro, subreg
from public.assets
where primarykey is null
   or primarykey = ''
   or primarykey !~ '^[0-9A-Z-]+$'
order by tenantid, primarykey
limit 50;

-- 5.3 Duplicados pela identidade do ERP (devem ser 0)
select tenantid,
       substring(coalesce(filial, '') from '^[0-9]+') as filial_codigo,
       registro, subreg, count(*) as linhas
from public.assets
where coalesce(registro, '') <> '' or coalesce(subreg, '') <> ''
group by 1, 2, 3, 4
having count(*) > 1
order by linhas desc
limit 50;

-- 5.4 Linhas sem identidade de ERP (não têm registro nem subreg): ficam com
--     chave derivada do conteúdo. Só inspeccione — não são erro.
select tenantid, count(*) as sem_identidade
from public.assets
where coalesce(registro, '') = '' and coalesce(subreg, '') = ''
group by 1
order by 2 desc;

-- 5.5 Índices que ficaram em `assets` (confirme os canónicos)
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'assets'
order by indexname;
