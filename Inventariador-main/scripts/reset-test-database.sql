-- ============================================================================
-- GBR KARDEK · Inventariador — RESET DA BASE DE TESTE (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- ATENÇÃO: ESTE SCRIPT APAGA TABELAS. Use APENAS no projeto de TESTE.
--
-- O que faz:
--   1. Confirma que quem corre sabe o que está a fazer (guarda explícita).
--   2. DROP TABLE das tabelas de inventário/auditoria que o bootstrap recria
--      (as que não existirem são ignoradas, sem erro).
--   3. Deixa a recriação para o schema canónico do repositório:
--      `docs/supabase_bootstrap.sql` — rodar depois, no mesmo editor.
--      Assim as tabelas, colunas, PK composta (tenantid, id), índice único
--      (tenantid, primarykey), índices de leitura, defaults e políticas RLS
--      voltam exactamente como o app espera, sem cirurgia manual de índices.
--   4. Traz as validações pós-carga (volume por unidade, chaves vazias,
--      duplicados por contrato e índices de `assets`).
--
-- O que NÃO faz:
--   - Não toca em `auth.users` (logins) nem em `user_permissions` por omissão
--     (ver § 1-B; apagar `user_permissions` tranca todos os utilizadores).
--   - Não limpa o aparelho: isso é feito no app depois do reset, em
--     Gestor de Base → «Preparar Nova Carga».
--
-- ============================================================================
-- USO
-- ----------------------------------------------------------------------------
-- 1) SQL Editor → New query: descomente e rode primeiro, isolada, a autorização:
--        select set_config('gbr.reset_test', 'SIM-TENHO-CERTEZA', false);
--    Sem ela o script aborta com uma mensagem — protecção contra correr isto
--    no projeto errado.
-- 2) No mesmo editor, rode § 0 + § 1 (drops).
-- 3) No mesmo editor, rode agora `docs/supabase_bootstrap.sql` (recria tudo).
-- 4) No dispositivo: Gestor de Base → «Preparar Nova Carga» (limpa a base
--    local, o espelho virtual, os endereços, a trilha e a fila da âncora).
-- 5) Carga de Dados.
-- 6) Corra o bloco § 3 (VALIDAÇÕES PÓS-CARGA).
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
-- 1. DROPAR AS TABELAS DE INVENTÁRIO / AUDITORIA
--
--    1-A. Tabelas que o `docs/supabase_bootstrap.sql` RECRIA: podem ser
--         dropadas sem risco de ficarem em falta.
--    1-C. Tabelas que o app USA mas o bootstrap NÃO recria (movimentos,
--         depreciação, grupos, plano de contas, NCM, log térmico).
--         Por omissão são MANTIDAS — dropar sem DDL para recriar deixaria o app
--         com PGRST205 nessas telas. Para as incluir, autorize também:
--             select set_config('gbr.reset_drop_extras', 'SIM', false);
--
--    `cascade` remove FKs/views dependentes (não dropa as tabelas que só
--    referenciam). Tabelas inexistentes são ignoradas.
-- ----------------------------------------------------------------------------
do $$
declare
  alvo text;
  extras boolean := current_setting('gbr.reset_drop_extras', true) = 'SIM';
begin
  foreach alvo in array array[
    'assets',
    'asset_logs',
    'asset-photos',
    'locations',
    'inventory_config',
    'unit_configs',
    'campaigns',
    'campaign_snapshots',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', alvo)) is not null then
      execute format('drop table public.%I cascade', alvo);
      raise notice 'dropada (recriada pelo bootstrap): public.%', alvo;
    else
      raise notice 'ignorada (não existe): public.%', alvo;
    end if;
  end loop;

  -- 1-C. Sem DDL no repositório para recriar: mantidas por omissão.
  foreach alvo in array array[
    'asset_movements',
    'asset_depreciation_history',
    'asset_groups',
    'chart_of_accounts',
    'ncm_classifiers',
    'log_inventario_termico'
  ]
  loop
    if to_regclass(format('public.%I', alvo)) is null then
      raise notice 'ignorada (não existe): public.%', alvo;
    elsif extras then
      execute format('drop table public.%I cascade', alvo);
      raise notice 'dropada (reset_drop_extras=SIM, precisa de DDL próprio): public.%', alvo;
    else
      raise notice 'MANTIDA (o bootstrap não a recria; use gbr.reset_drop_extras=SIM para dropar): public.%', alvo;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1-B. UTILIZADORES (OPCIONAL — descomente só se quiser recriar os perfis)
--      Apagar `user_permissions` remove os perfis (ADMIN/MASTER/…). Os logins
--      em `auth.users` não são tocados nem devem ser: sem eles ninguém entra.
-- ----------------------------------------------------------------------------
-- drop table public.user_permissions cascade;

commit;

-- ----------------------------------------------------------------------------
-- 2. RECRIAR O SCHEMA
--    Rode agora, neste mesmo editor, o conteúdo de `docs/supabase_bootstrap.sql`.
--    É idempotente e repõe tabelas, colunas, PK (tenantid, id), índice único
--    (tenantid, primarykey), índices de leitura, defaults e políticas RLS.
--
--    Confirmação rápida de que a recriação passou:
-- ----------------------------------------------------------------------------
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- ----------------------------------------------------------------------------
-- 3. VALIDAÇÕES PÓS-CARGA
--    Rode depois da Carga de Dados. § 3.2 e § 3.3 devem devolver 0 linhas.
-- ----------------------------------------------------------------------------
-- 3.1 Volume por contrato e unidade — confira contra a planilha
select tenantid,
       substring(coalesce(filial, '') from '^[0-9]+') as filial_codigo,
       count(*) as linhas
from public.assets
group by 1, 2
order by 1, 2;

-- 3.2 Ativos sem chave primária (esperado: 0 linhas)
select tenantid, id, filial, etiqueta
from public.assets
where primarykey is null or primarykey = ''
order by tenantid, id
limit 50;

-- 3.3 Mesma chave repetida dentro do contrato (esperado: 0 linhas — o índice
--     único (tenantid, primarykey) do bootstrap impede o caso)
select tenantid, primarykey, count(*) as linhas
from public.assets
group by 1, 2
having count(*) > 1
order by linhas desc
limit 50;

-- 3.4 Índices que o bootstrap deixou em `assets`
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'assets'
order by indexname;
