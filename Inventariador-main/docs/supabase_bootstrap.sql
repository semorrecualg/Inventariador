-- ============================================================================
-- GBR KARDEK – Inventariador · Bootstrap do schema Supabase (multi-tenant)
-- ----------------------------------------------------------------------------
-- Cria as tabelas que o app grava (colunas verificadas nos payloads reais de
-- src/services/syncService.ts e src/services/supabaseService.ts).
--
-- COMO USAR:
--   1) Supabase Dashboard → SQL Editor → New query → cole TODO o conteúdo → Run.
--   2) Idempotente: pode rodar de novo sem efeito colateral.
--   3) RESILIENTE A SCHEMA LEGADO: se o projeto JÁ TINHA tabelas (ex.: criadas
--      por versões anteriores), os `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
--      abaixo garantem as colunas críticas (created_at/updated_at/tenantid...)
--      SEM destruir dados. Isso corrige o erro 42703 ("column created_at does
--      not exist") que ocorre quando a tabela legada não tem a coluna.
--   4) Se a estrutura legada for INCOMPATÍVEL (ex.: tabela sem coluna `id`),
--      drope SÓ a tabela conflitante e rode o script de novo — os dados serão
--      re-sincronizados do dispositivo:
--        DROP TABLE IF EXISTS public.<tabela>;  -- ex.: public.audit_logs
--   5) HARDENING (recomendado depois do MVP): troque as políticas permissivas
--      abaixo por políticas restritas por `tenantid` (auth.uid()/JWT claim).
--
-- NOTA IMPORTANTE (erros 42601/26000): as políticas RLS são escritas de forma
-- ESTÁTICA (uma instrução DROP + CREATE POLICY por tabela) — sem DO/EXECUTE/
-- format() dinâmico. Isso evita (a) o nome de política inválido p_"asset-photos"_all
-- e (b) o erro "prepared statement format does not exist" quando o editor divide
-- o script. O nome da política é fixo (`p_all`) — único por tabela.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ASSETS — espelho da tabela de ativos (payload completo do syncService)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid          text NOT NULL,
  filial            text,
  status            text,
  etiqueta          text,
  qt                numeric,
  descricaodoativo  text,
  serial            text,
  dataaqusic        text,
  cnpj              text,
  nomefornecedor    text,
  notafiscal        text,
  endereco          text,
  registro          text,
  subreg            text,
  databaixa         text,
  contacontabil     text,
  primarykey        text,
  centrodecusto     text,
  vlraquisic        numeric,
  sn1_recno         numeric,
  sn3_recno         numeric,
  DE_PARA           text,
  gps_lat           numeric,
  gps_lng           numeric,
  currentCampaignId text,
  is_deleted        boolean NOT NULL DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Garante colunas críticas em schema legado (no-op se a tabela foi criada acima)
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS primarykey text;

-- COLUNAS DO PAYLOAD DE ESPELHAMENTO (src/services/supabaseService.ts -> buildPayload):
-- uma tabela `assets` criada antes do GBR v2.6 nao as tem, e o PostgREST rejeita o
-- LOTE INTEIRO com PGRST204 ("Could not find the 'cnpj' column of 'assets' in the
-- schema cache"). O espelhamento em massa terminava com 0 de 12.636 ativos
-- sincronizados. Idempotente: no-op quando a coluna ja existe.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS etiqueta text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS qt numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS descricaodoativo text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS serial text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS dataaqusic text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS nomefornecedor text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS notafiscal text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS registro text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS subreg text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS databaixa text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS contacontabil text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS centrodecusto text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vlraquisic numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS sn1_recno numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS sn3_recno numeric;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS gps_lat numeric(18,10);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS gps_lng numeric(18,10);
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS "DE_PARA" text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS "currentCampaignId" text;

-- EXCLUSÃO (SOFT DELETE): a flag local `_is_deleted` viaja no payload como
-- `is_deleted`. Sem esta coluna a exclusão nunca saía do aparelho: o pull
-- devolvia a linha ativa e o ativo ressuscitava. Numa base que já existe, o
-- mesmo bloco vive em scripts/assets-exclusao.sql.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
UPDATE public.assets SET is_deleted = false WHERE is_deleted IS NULL;
ALTER TABLE public.assets ALTER COLUMN is_deleted SET DEFAULT false;

-- TRAVA CONTRA A RESSURREIÇÃO: um APK antigo (ou uma cópia local que nunca viu
-- a exclusão) envia `is_deleted = false` sobre a linha apagada e o ativo volta
-- para todos. O trigger recusa, excepto quando a mesma escrita traz um
-- `restored_at` novo — a marca explícita de restauro que só `restoreAsset`
-- envia. Numa base que já existe, o mesmo bloco vive em
-- scripts/assets-restauro-trigger.sql.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS restored_at timestamptz;

CREATE OR REPLACE FUNCTION public.assets_bloquear_ressurreicao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_deleted IS TRUE AND NEW.is_deleted IS NOT TRUE THEN
    IF NEW.restored_at IS NULL OR NEW.restored_at IS NOT DISTINCT FROM OLD.restored_at THEN
      RAISE EXCEPTION 'Exclusão prevalece: para pôr is_deleted = false é preciso um restored_at novo (restauro explícito).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_bloquear_ressurreicao ON public.assets;
CREATE TRIGGER assets_bloquear_ressurreicao
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.assets_bloquear_ressurreicao();

-- SRE ISOLAMENTO DE CONTRATO: a unicidade da chave de origem é POR TENANT —
-- a mesma chave primária pode existir legitimamente em contratos diferentes
-- (ex.: base de teste do CLIENTETESTE copiada do CICOPAL). O índice GLOBAL
-- antigo (assets_primarykey_key em primarykey) impedia a coexistência e, com
-- o upsert por 'id', permitia que uma carga SOBRESCREVESSE ativos de outro
-- contrato. Ambos os problemas são resolvidos escopando por (tenantid, ...).
DROP INDEX IF EXISTS public.assets_primarykey_key;
-- SEM `WHERE primarykey IS NOT NULL`: um índice único PARCIAL não serve de
-- alvo para o `upsert(…, { onConflict: 'tenantid, primarykey' })` da fila
-- (`syncService.processDataSyncQueue`) — o PostgREST não envia o predicado, o
-- ON CONFLICT não encontra o índice e a escrita vira INSERT, que colide no
-- próprio índice (23505) em vez de actualizar a linha. O predicado era
-- redundante: num índice único, NULLs são distintos por omissão.
-- Contrato guardado por `src/__tests__/assetsConflictIndex.test.ts`.
CREATE UNIQUE INDEX IF NOT EXISTS assets_tenant_primarykey_key
  ON public.assets (tenantid, primarykey);

-- PK COMPOSTA (tenantid, id): a MESMA chave de origem pode existir em
-- contratos diferentes SEM sobrescrever — é o alvo de conflito do upsert do
-- syncAssetsToCloud (onConflict: 'tenantid, id'). Remove a PK antiga em id
-- sozinho, que impedia a coexistência multi-tenant.
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_pkey;
ALTER TABLE public.assets ADD PRIMARY KEY (tenantid, id);

CREATE INDEX IF NOT EXISTS assets_tenantid_idx ON public.assets (tenantid);
CREATE INDEX IF NOT EXISTS assets_tenant_filial_idx ON public.assets (tenantid, filial);

-- CARIMBO DA NUVEM EM CADA UPDATE: o pull delta baixa `updated_at > checkpoint`
-- (fetchFullInventory, ETAPA 5b). Sem trigger, `updated_at` só valia no INSERT:
-- o upsert da conferência actualizava a linha sem mexer no carimbo e a alteração
-- ficava invisível aos outros aparelhos. O app não envia `updated_at` (o relógio
-- do aparelho podia empurrar o checkpoint para o futuro); quem carimba é o
-- servidor. Numa base que já existe, o mesmo bloco vive em
-- scripts/assets-updated-at-trigger.sql.
UPDATE public.assets SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assets_touch_updated_at ON public.assets;
CREATE TRIGGER assets_touch_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- 2. INVENTORY_CONFIG — config de unidade + âncora GPS (upsert por filial)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text NOT NULL,
  filial      text,
  data        jsonb,
  lat         numeric,
  lng         numeric,
  radius_meters numeric,
  is_active   boolean DEFAULT true,
  updated_by  text,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS lng numeric;
ALTER TABLE public.inventory_config ADD COLUMN IF NOT EXISTS radius_meters numeric;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_config_tenant_filial_key
  ON public.inventory_config (tenantid, filial);

-- ============================================================================
-- 2-B. UNIT_CONFIGS — configuracao/ancora GPS por unidade
--      Lida por fetchUnitConfigs, fetchTenantFiliais e AssetControlModule. Nao
--      existia no projeto (PGRST205: "Could not find the table
--      'public.unit_configs'"), por isso as filiais em modo nuvem caiam sempre
--      para os dados locais e os cards ficavam em "FALTA ANCORA GPS E CAMPANHA".
--      Colunas espelham a interface UnitConfig (src/types.ts).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.unit_configs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid      text NOT NULL,
  filial        text,
  unit_id       text,
  _unitid       text,
  lat           numeric(18,10) DEFAULT 0,
  lng           numeric(18,10) DEFAULT 0,
  radius_meters numeric DEFAULT 200,
  is_active     boolean DEFAULT true,
  updated_by    text,
  -- Flags de política da unidade (hasGps, requireNf...) — jsonb para manter os
  -- nomes camelCase do tipo UnitConfig (colunas viriam em minúsculas).
  flags         jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS unit_id text;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS _unitid text;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS lat numeric(18,10) DEFAULT 0;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS lng numeric(18,10) DEFAULT 0;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS radius_meters numeric DEFAULT 200;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.unit_configs ADD COLUMN IF NOT EXISTS flags jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS unit_configs_tenant_filial_key
  ON public.unit_configs (tenantid, filial);

-- ============================================================================
-- 3. AUDIT_LOGS — trilha de auditoria
--    (FONTE DO ERRO 42703: tabela legada sem a coluna created_at — corrigido
--     pelos ALTERs abaixo)
-- ============================================================================
-- Esquema real verificado no projeto de produção (23/11/2026): `id` uuid com
-- default, `user_email` NOT NULL e `details`/`new_data`/`old_data` em jsonb
-- (confirmado na information_schema; a mensagem 22P02 diz «type json» para os
-- dois tipos). Instalações novas usam jsonb, alinhado com a produção; uma base
-- já existente NÃO é alterada por este CREATE TABLE IF NOT EXISTS. Ver
-- SCHEMA_BASELINE §3.2.1.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  user_email  text NOT NULL,
  action      text,
  table_name  text,
  record_id   text,
  details     jsonb,
  origin      text,
  new_data    jsonb,
  old_data    jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id text;

CREATE INDEX IF NOT EXISTS audit_logs_tenantid_idx ON public.audit_logs (tenantid);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);

-- F2 — idempotência da trilha enviada pelo app.
-- `client_event_id` é o `id` do evento no Dexie; o app faz upsert por ele, e o
-- índice único garante que um reenvio (offline → online, retry) não duplica.
-- Linhas antigas ficam com NULL, e vários NULL convivem num índice único.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS client_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_client_event_id_key
  ON public.audit_logs (client_event_id);

-- ============================================================================
-- 4. USER_PERMISSIONS — perfil de usuário (upsert onConflict email)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  username    text,
  name        text,
  role        text,
  is_admin    boolean DEFAULT false,
  tenantid    text,
  filial      text,
  units       text[], -- text[] (schema real/legado e payload do app); NÃO usar jsonb
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS units text[];
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS user_permissions_email_key
  ON public.user_permissions (email);

-- 4-B. AUTO-REGISTO — o perfil nasce AUDITOR, sem contrato
-- `raw_user_meta_data` é escrito pelo cliente do signUp: qualquer pessoa com a
-- anon key envia role=ADMIN e tenantid=<contrato alheio>. Este trigger ignora
-- esses campos (papel, is_admin, contrato, filial e unidades são fixos) e deixa
-- só username/nome, que são cosméticos. O vínculo ao contrato é dado por um
-- admin depois de a conta existir (política p_admin_all — ver 7-A).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  v_username text := coalesce(NULLIF(meta ->> 'username', ''), split_part(coalesce(NEW.email, ''), '@', 1));
BEGIN
  INSERT INTO public.user_permissions (
    id, email, username, name, role, tenantid, filial, units, is_admin
  )
  VALUES (
    NEW.id,
    lower(coalesce(NEW.email, '')),
    v_username,
    coalesce(NULLIF(meta ->> 'name', ''), v_username),
    'AUDITOR',
    '',
    '',
    ARRAY[]::text[],
    false
  )
  ON CONFLICT (email) DO UPDATE SET
    id         = EXCLUDED.id,
    updated_at = now()
  WHERE public.user_permissions.id IS NULL;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user           ON auth.users;
DROP TRIGGER IF EXISTS on_user_created           ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. LOCATIONS — unidades/endereços (unique name+tenantid exigido pelo app)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  tenantid    text,
  data        jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS data jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS locations_name_tenantid_key
  ON public.locations (name, tenantid);

-- ============================================================================
-- 6. CAMPANHAS / SNAPSHOTS / ASSET_LOGS / ASSET-PHOTOS
--    (colunas mínimas compatíveis com os upserts do app; colunas extras não
--     quebram o PostgREST — colunas FALTANTES sim)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  filial      text,
  name        text,
  description text,
  status      text,
  created_by  text,
  start_date  timestamptz,
  data        jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS filial text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS start_date timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS data jsonb;
-- Schema legado de campanhas pode ter `unit_id NOT NULL` que o app NÃO envia
-- (probe REST real: 23502 em todo INSERT). Torna a coluna opcional — o app
-- grava a unidade em `filial`, não em `unit_id`.
-- PostgreSQL NÃO suporta "ALTER COLUMN IF EXISTS" (erro 42601).
-- O bloco DO abaixo é condicional e idempotente: só altera se a coluna existir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'unit_id'
  ) THEN
    ALTER TABLE public.campaigns ALTER COLUMN unit_id DROP NOT NULL;
  END IF;
END $$;

-- FASE 1 — a campanha é a CHAVE DE CONTROLO da filial: aberta (CREATED ou
-- ACTIVE) exige filial preenchida. A restrição entra como NOT VALID para não
-- quebrar bases legadas com campanhas antigas sem filial; toda gravação nova
-- passa a ser verificada.
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_filial_obrigatoria;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_filial_obrigatoria
  CHECK (status NOT IN ('CREATED','ACTIVE') OR (filial IS NOT NULL AND btrim(filial) <> '')) NOT VALID;

CREATE INDEX IF NOT EXISTS campaigns_tenant_filial_idx ON public.campaigns (tenantid, filial);
-- O índice ÚNICO parcial (uma só campanha aberta por filial) falha de propósito
-- quando a base já tem duplicados, por isso vive no script de migração
-- docs/supabase_campanhas_fase1.sql — rode-o depois deste.

CREATE TABLE IF NOT EXISTS public.campaign_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text,
  tenantid    text,
  assets_data jsonb,
  metadata    jsonb,
  closed_at   timestamptz,
  closed_by   text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS campaign_id text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS assets_data jsonb;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS closed_by text;
ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS data jsonb;

CREATE TABLE IF NOT EXISTS public.asset_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  user_email  text,
  action      text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS data jsonb;
-- O log de auditoria do app grava `details` (logAuditEvent). Sem a coluna, o
-- PostgREST responde 42703 e a trilha de SYNC_PUSH/SYNC_PULL fica sem registo.
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS details text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS table_name text;
-- Grafia legada `tenant_id`: um trigger criado na base (fora do repositório)
-- grava o log de ativos com `tenant_id`. Sem a coluna, o INSERT do trigger falha
-- com 42703, a transação do upsert é abortada e o espelhamento termina com
-- "0 ativos sincronizados, 12636 rejeitados" — a mensagem cita asset_logs mesmo
-- que o problema esteja no trigger e não no payload do app (que envia `tenantid`).
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS new_data jsonb;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS old_data jsonb;
ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS "timestamp" timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public."asset-photos" (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantid    text,
  asset_id    text,
  photo_url   text,
  data        jsonb,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS tenantid text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public."asset-photos" ADD COLUMN IF NOT EXISTS data jsonb;

-- ============================================================================
-- 6-B. DEFAULT DE `id` EM TABELAS LEGADAS (FONTE DO ERRO 23502)
--      Se o projeto JÁ TINHA a tabela criada por um script antigo SEM o
--      `DEFAULT gen_random_uuid()` no `id` (ex.: `id uuid NOT NULL` puro), o
--      `CREATE TABLE IF NOT EXISTS` NÃO reaplica o default — e todo upsert do
--      app que NÃO envia `id` explícito falharia com "null value in column id
--      violates not-null constraint". É o caso da âncora GPS do UnitConfigurator
--      (grava por tenantid+filial em inventory_config) e dos demais upserts por
--      índice único. Estes ALTERs são idempotentes e corrigem o schema legado.
-- ============================================================================
ALTER TABLE public.assets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.inventory_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.locations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.campaigns ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.campaign_snapshots ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.asset_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.unit_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public."asset-photos" ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ============================================================================
-- 7. RLS — políticas estáticas e idempotentes.
--    Sem políticas, toda gravação da nuvem falharia com 401/42501 (o app
--    tolera, mas nada sincronizaria).
--    Só `unit_configs` mantém `p_all` (exposição seguinte, ainda em aberto —
--    ver docs/GOVERNANCA.md). `assets`, `user_permissions`, `asset-photos` e as
--    tabelas de operação (inventory_config, audit_logs, locations, campaigns,
--    campaign_snapshots, asset_logs, base_generation) ficam limitadas ao
--    contrato do utilizador, com MASTER a atravessar, e `anon` perde o
--    privilégio de tabela — ver 7-A, docs/supabase_rls_assets_permissoes.sql e
--    docs/supabase_rls_tabelas_restantes.sql.
--    Nome de política fixo (`p_all` / `p_tenant_all` / `p_self_*` /
--    `p_admin_all` / `p_tenant_select|insert` / `p_authenticated_select`) —
--    nunca interpolado.
-- ============================================================================
ALTER TABLE public.assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_configs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."asset-photos"    ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7-A. FUNÇÕES DE APOIO E GUARDA DE user_permissions
-- ----------------------------------------------------------------------------
-- Todas SECURITY DEFINER: as políticas chamam-nas e elas leem
-- user_permissions — sem isso, a política de user_permissions chamar-se-ia a
-- si mesma (erro 42P17, "infinite recursion detected in policy").
-- O SQL Editor / service_role (auth.uid() nulo) não é afectado pelas guardas.
-- ============================================================================
SET LOCAL check_function_bodies = off;

-- get_tenantid(): contrato do utilizador autenticado. Casa pelo id do Auth e,
-- como rede de segurança, pelo e-mail do JWT — há perfis legados com `id`
-- nulo/desalinhado, e o app só os corrige depois de ler o perfil.
CREATE OR REPLACE FUNCTION public.get_tenantid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT up.tenantid
  FROM public.user_permissions up
  WHERE public.is_self_row(up.id, up.email)
  ORDER BY (up.id = auth.uid()) DESC
  LIMIT 1
$$;

-- is_self_row(): a linha pertence ao utilizador do pedido (por id ou e-mail).
-- Recebe os valores por parâmetro para poder ser usada nas políticas sem
-- provocar leitura recursiva da tabela.
CREATE OR REPLACE FUNCTION public.is_self_row(p_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       p_id = auth.uid()
       OR (
         btrim(coalesce(auth.jwt() ->> 'email', '')) <> ''
         AND lower(btrim(coalesce(p_email, ''))) = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
       )
     )
$$;

-- is_master(): único perfil com visão entre contratos (dono global).
CREATE OR REPLACE FUNCTION public.is_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE public.is_self_row(up.id, up.email)
      AND upper(btrim(coalesce(up.role, ''))) = 'MASTER'
  )
$$;

-- is_tenant_admin(): ADMIN/MASTER do próprio contrato (gestão de utilizadores).
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE public.is_self_row(up.id, up.email)
      AND (
        coalesce(up.is_admin, false)
        OR upper(btrim(coalesce(up.role, ''))) IN ('ADMIN', 'MASTER')
      )
  )
$$;

-- email_by_username(): a ÚNICA consulta que `anon` pode fazer a
-- user_permissions (login por username antes do signIn). Devolve só o e-mail e
-- só por igualdade exata — não permite listar nem ler o resto da linha.
CREATE OR REPLACE FUNCTION public.email_by_username(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT up.email
  FROM public.user_permissions up
  WHERE btrim(coalesce(p_username, '')) <> ''
    AND lower(btrim(coalesce(up.username, ''))) = lower(btrim(coalesce(p_username, '')))
  LIMIT 1
$$;

SET LOCAL check_function_bodies = on;

REVOKE ALL ON FUNCTION public.get_tenantid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenantid() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tenantid() TO authenticated;

REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_self_row(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_self_row(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_master() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_master() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_master() TO authenticated;

REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_tenant_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_by_username(text) TO anon, authenticated;

-- O login por username já não faz SELECT na tabela: este índice serve a RPC.
CREATE INDEX IF NOT EXISTS user_permissions_username_lower_idx
  ON public.user_permissions (lower(btrim(coalesce(username, ''))));

-- Guarda dos campos privilegiados: as políticas dão acesso à LINHA, não à
-- COLUNA. Sem esta guarda, qualquer utilizador podia fazer UPDATE da própria
-- linha e tornar-se ADMIN, mudar de contrato ou entrar noutro tenant.
CREATE OR REPLACE FUNCTION public.guard_user_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_master() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- ADMIN do contrato a provisionar outro utilizador: deixa passar (a
    -- política de INSERT limita o contrato ao dele).
    IF public.is_tenant_admin() AND NOT public.is_self_row(NEW.id, NEW.email) THEN
      RETURN NEW;
    END IF;
    -- Auto-registo público: nunca cria administrador nem entra num contrato.
    -- Sem contrato, o utilizador só recebe dados depois de um admin o vincular.
    NEW.role := 'AUDITOR';
    NEW.is_admin := false;
    NEW.tenantid := '';
    NEW.units := '{}';
    RETURN NEW;
  END IF;

  IF NOT public.is_self_row(OLD.id, OLD.email) THEN
    RETURN NEW; -- gestão de outro utilizador pelo admin do contrato
  END IF;

  -- O app corrige `id` a partir do e-mail no primeiro login; é a única mudança
  -- de chave permitida, e só para o próprio uid do Auth.
  IF NEW.id IS DISTINCT FROM OLD.id AND NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_permissions: o id só pode ser reclamado pelo próprio utilizador'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR coalesce(NEW.is_admin, false) IS DISTINCT FROM coalesce(OLD.is_admin, false)
     OR upper(btrim(coalesce(NEW.role, ''))) IS DISTINCT FROM upper(btrim(coalesce(OLD.role, '')))
     OR NEW.tenantid IS DISTINCT FROM OLD.tenantid
     OR NEW.units IS DISTINCT FROM OLD.units THEN
    RAISE EXCEPTION 'user_permissions: um utilizador não altera o próprio papel, contrato ou permissões'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS user_permissions_guard ON public.user_permissions;
CREATE TRIGGER user_permissions_guard
  BEFORE INSERT OR UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_permissions();

-- tenant_visible(): a regra de contrato das tabelas de operação (7-C), num só
-- sítio. MASTER atravessa; perfil com contrato vê o seu; perfil sem contrato
-- só alcança linhas sem contrato (eventos de login de contas novas).
CREATE OR REPLACE FUNCTION public.tenant_visible(p_tenantid text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_master()
      OR (
        btrim(coalesce(public.get_tenantid(), '')) <> ''
        AND lower(btrim(coalesce(p_tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
      )
      OR (
        btrim(coalesce(public.get_tenantid(), '')) = ''
        AND btrim(coalesce(p_tenantid, '')) = ''
      )
$$;

REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_visible(text) TO authenticated;

-- assets: só authenticated, limitado ao contrato (MASTER atravessa).
DROP POLICY IF EXISTS p_all ON public.assets;
DROP POLICY IF EXISTS p_tenant_all ON public.assets;
CREATE POLICY p_tenant_all ON public.assets
  FOR ALL TO authenticated
  USING (
    public.is_master()
    OR (
      btrim(coalesce(public.get_tenantid(), '')) <> ''
      AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
    )
  )
  WITH CHECK (
    public.is_master()
    OR (
      btrim(coalesce(public.get_tenantid(), '')) <> ''
      AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
    )
  );

REVOKE ALL ON public.assets FROM anon;

-- 7-C. TABELAS DE OPERAÇÃO — contrato, sem anon (docs/supabase_rls_tabelas_restantes.sql)
--    inventory_config/locations/campaigns: contrato inteiro; MASTER atravessa.
--    campaign_snapshots/asset_logs/audit_logs: append-only (só SELECT/INSERT) —
--    a trilha e os laudos não são reescrevíveis pelo PostgREST.
--    base_generation: só leitura para authenticated; escrita pelo SQL de reset.
--    FORA DO ÂMBITO: `unit_configs` continua com p_all (exposição seguinte).
DROP POLICY IF EXISTS p_all ON public.inventory_config;
DROP POLICY IF EXISTS p_tenant_all ON public.inventory_config;
CREATE POLICY p_tenant_all ON public.inventory_config
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.inventory_config FROM anon;

-- unit_configs: ainda aberta a anon — a próxima exposição a fechar.
DROP POLICY IF EXISTS p_all ON public.unit_configs;
CREATE POLICY p_all ON public.unit_configs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_all ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.audit_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.audit_logs;
CREATE POLICY p_tenant_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.tenant_visible(coalesce(tenantid, tenant_id)));
CREATE POLICY p_tenant_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(coalesce(tenantid, tenant_id)));
REVOKE ALL ON public.audit_logs FROM anon;

-- user_permissions: sem anon; cada um na sua linha; admin no contrato.
DROP POLICY IF EXISTS p_all ON public.user_permissions;
DROP POLICY IF EXISTS p_self_select ON public.user_permissions;
DROP POLICY IF EXISTS p_self_insert ON public.user_permissions;
DROP POLICY IF EXISTS p_self_update ON public.user_permissions;
DROP POLICY IF EXISTS p_admin_all ON public.user_permissions;

CREATE POLICY p_self_select ON public.user_permissions
  FOR SELECT TO authenticated
  USING (public.is_self_row(id, email));

CREATE POLICY p_self_insert ON public.user_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_self_row(id, email)
    AND (id IS NULL OR id = auth.uid())
  );

CREATE POLICY p_self_update ON public.user_permissions
  FOR UPDATE TO authenticated
  USING (public.is_self_row(id, email))
  WITH CHECK (public.is_self_row(id, email));

CREATE POLICY p_admin_all ON public.user_permissions
  FOR ALL TO authenticated
  USING (
    public.is_master()
    OR (
      public.is_tenant_admin()
      AND (
        btrim(coalesce(tenantid, '')) = ''
        OR (
          btrim(coalesce(public.get_tenantid(), '')) <> ''
          AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
        )
      )
    )
  )
  WITH CHECK (
    public.is_master()
    OR (
      public.is_tenant_admin()
      AND (
        btrim(coalesce(tenantid, '')) = ''
        OR (
          btrim(coalesce(public.get_tenantid(), '')) <> ''
          AND lower(btrim(coalesce(tenantid, ''))) = lower(btrim(coalesce(public.get_tenantid(), '')))
        )
      )
    )
  );

REVOKE ALL ON public.user_permissions FROM anon;

DROP POLICY IF EXISTS p_all ON public.locations;
DROP POLICY IF EXISTS p_tenant_all ON public.locations;
CREATE POLICY p_tenant_all ON public.locations
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.locations FROM anon;

DROP POLICY IF EXISTS p_all ON public.campaigns;
DROP POLICY IF EXISTS p_tenant_all ON public.campaigns;
CREATE POLICY p_tenant_all ON public.campaigns
  FOR ALL TO authenticated
  USING (public.tenant_visible(tenantid))
  WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.campaigns FROM anon;

DROP POLICY IF EXISTS p_all ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_select ON public.campaign_snapshots;
DROP POLICY IF EXISTS p_tenant_insert ON public.campaign_snapshots;
CREATE POLICY p_tenant_select ON public.campaign_snapshots
  FOR SELECT TO authenticated
  USING (public.tenant_visible(tenantid));
CREATE POLICY p_tenant_insert ON public.campaign_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(tenantid));
REVOKE ALL ON public.campaign_snapshots FROM anon;

DROP POLICY IF EXISTS p_all ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_select ON public.asset_logs;
DROP POLICY IF EXISTS p_tenant_insert ON public.asset_logs;
CREATE POLICY p_tenant_select ON public.asset_logs
  FOR SELECT TO authenticated
  USING (public.tenant_visible(coalesce(tenantid, tenant_id)));
CREATE POLICY p_tenant_insert ON public.asset_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.tenant_visible(coalesce(tenantid, tenant_id)));
REVOKE ALL ON public.asset_logs FROM anon;

DROP POLICY IF EXISTS p_all ON public."asset-photos";
DROP POLICY IF EXISTS p_tenant_all ON public."asset-photos";
CREATE POLICY p_tenant_all ON public."asset-photos" FOR ALL TO authenticated
  USING (lower(tenantid) = lower(public.get_tenantid()))
  WITH CHECK (lower(tenantid) = lower(public.get_tenantid()));

-- ============================================================================
-- 7-B. BUCKET asset-photos PRIVADO (mesmo SQL de docs/supabase_privacidade_storage.sql)
-- ----------------------------------------------------------------------------
-- O bucket de fotos era público: qualquer pessoa com o URL lia a evidência
-- fotográfica de qualquer contrato. Passa a privado; a app guarda o CAMINHO em
-- `_photoUrl` e pede uma URL assinada (`createSignedUrl`, 1 h) quando mostra.
-- As quatro políticas de storage.objects só dão acesso à pasta do tenant do
-- utilizador autenticado (photos/{tenantid}/...).
-- ============================================================================
-- get_tenantid(), is_self_row(), is_master(), is_tenant_admin(), a guarda de
-- user_permissions e email_by_username() são criadas em 7-A (as políticas de
-- `assets` e `user_permissions` precisam delas antes). Não duplicar aqui para
-- as duas cópias não divergirem.

INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-photos', 'asset-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS p_asset_photos_tenant_select ON storage.objects;
CREATE POLICY p_asset_photos_tenant_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_insert ON storage.objects;
CREATE POLICY p_asset_photos_tenant_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_update ON storage.objects;
CREATE POLICY p_asset_photos_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  )
  WITH CHECK (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

DROP POLICY IF EXISTS p_asset_photos_tenant_delete ON storage.objects;
CREATE POLICY p_asset_photos_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'asset-photos'
    AND (storage.foldername(name))[1] = 'photos'
    AND lower((storage.foldername(name))[2]) = lower(public.get_tenantid())
  );

-- Objectos antigos fora de `photos/{tenantid}/...` deixariam de ser alcançáveis
-- por política: passam a viver dentro da pasta do tenant (nada é apagado).
UPDATE storage.objects o
SET name = 'photos/' || up.tenantid || '/backups/'
           || split_part(o.name, '/', 2) || '/' || split_part(o.name, '/', 3)
FROM public.user_permissions up
WHERE o.bucket_id = 'asset-photos'
  AND o.name LIKE 'backups/%'
  AND up.id::text = split_part(o.name, '/', 2);

UPDATE storage.objects o
SET name = 'photos/' || o.name
WHERE o.bucket_id = 'asset-photos'
  AND o.name NOT LIKE 'photos/%'
  AND o.name NOT LIKE 'backups/%'
  AND EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE lower(up.tenantid) = lower(split_part(o.name, '/', 1))
  );

-- ============================================================================
-- 8. SELO DE GERAÇÃO DA BASE (uma linha) — ver docs/GERACAO_BASE.md
-- ----------------------------------------------------------------------------
-- Depois de um reset da nuvem, um aparelho com a base antiga reenviaria as
-- chaves velhas e repovoaria a tabela `assets`. O selo dá identidade à geração
-- corrente: o app compara-a antes de cada envio e recusa a base de uma geração
-- anterior (Gestor de Base → «Preparar Nova Carga» resolve).
--
-- `seq` sobe a cada reset e só serve para o rollout do selo: aparelhos que nunca
-- o viram adotam a geração 1 sem bloquear. O app só LÊ esta tabela; a escrita é
-- feita pelo SQL de reset (service_role/SQL Editor), nunca pelo cliente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.base_generation (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  seq        bigint NOT NULL DEFAULT 1,
  reset_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.base_generation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_all ON public.base_generation;
DROP POLICY IF EXISTS p_authenticated_select ON public.base_generation;
CREATE POLICY p_authenticated_select ON public.base_generation
  FOR SELECT TO authenticated
  USING (true);
REVOKE ALL ON public.base_generation FROM anon;

INSERT INTO public.base_generation (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================================
-- FUNÇÃO unit_names(p_tenantid) — nomes DISTINTOS do contrato numa consulta
-- ----------------------------------------------------------------------------
-- A tela de seleção de filial só precisa dos NOMES. Buscá-los paginando
-- `assets?select=filial` custa 13 pedidos de 1000 linhas num contrato de 12.636
-- ativos, só para extrair 5 nomes. A função faz o DISTINCT no servidor e devolve
-- 5 linhas numa consulta. Sem contrato, devolve vazio: o muro fica no servidor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.unit_names(p_tenantid text)
RETURNS SETOF text
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT upper(btrim(a.filial))
  FROM public.assets a
  WHERE a.tenantid = upper(btrim(coalesce(p_tenantid, '')))
    AND btrim(coalesce(a.filial, '')) <> ''
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.unit_names(text) TO anon, authenticated;

-- Recarrega o cache de esquema do PostgREST: sem isto o RPC pode responder
-- 404 (PGRST202) até ao próximo reload.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICAÇÃO (opcional — rode depois):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'audit_logs' ORDER BY ordinal_position;
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
--   SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name = 'inventory_config' AND column_name = 'id';
-- ============================================================================
