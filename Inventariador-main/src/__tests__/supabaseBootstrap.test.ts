// src/__tests__/supabaseBootstrap.test.ts
// Regressão para docs/supabase_bootstrap.sql:
//  - impede o retorno do DO/EXECUTE/format() dinâmico (erros 42601 e 26000 que
//    aconteceram ao rodar o script no SQL Editor do Supabase);
//  - garante as 9 políticas estáticas (p_all) e a resiliência a schema legado
//    (ALTER TABLE ... ADD COLUMN IF NOT EXISTS — erro 42703).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sqlPath = join(process.cwd(), 'docs', 'supabase_bootstrap.sql');
const sql = readFileSync(sqlPath, 'utf8');

/** Linhas de código: remove comentários `--` e linhas vazias. */
const codeLines = sql
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('--'));

const APP_TABLES = [
  'assets',
  'inventory_config',
  'audit_logs',
  'user_permissions',
  'locations',
  'campaigns',
  'campaign_snapshots',
  'asset_logs',
  'asset-photos'
] as const;

describe('docs/supabase_bootstrap.sql — invariantes (regressão 42601/26000/42703)', () => {
  it('não usa código dinâmico DO/EXECUTE/format (causas dos erros 42601 e 26000)', () => {
    const dynamic = codeLines.filter(
      (l) => /^(DO\s*\$\$|EXECUTE\s)/i.test(l) || /format\(/.test(l)
    );
    expect(dynamic).toEqual([]);
  });

  it('tem exatamente 9 pares DROP + CREATE POLICY (estático, um por tabela)', () => {
    expect(codeLines.filter((l) => l.startsWith('DROP POLICY IF EXISTS')).length).toBe(9);
    expect(codeLines.filter((l) => l.startsWith('CREATE POLICY')).length).toBe(9);
  });

  it('todas as políticas usam o nome fixo p_all (nunca interpolado)', () => {
    const policyLines = codeLines.filter(
      (l) => l.startsWith('CREATE POLICY') || l.startsWith('DROP POLICY IF EXISTS')
    );
    expect(policyLines.every((l) => /(?:CREATE POLICY|DROP POLICY IF EXISTS) p_all ON/.test(l))).toBe(true);
  });

  it('cobre as 9 tabelas do app com CREATE TABLE IF NOT EXISTS', () => {
    for (const t of APP_TABLES) {
      const ident = t === 'asset-photos' ? '"asset-photos"' : t;
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${ident}`);
    }
  });

  it('mantém os ALTERs ADD COLUMN IF NOT EXISTS (resiliência a schema legado — 42703)', () => {
    const alters = codeLines.filter(
      (l) => l.startsWith('ALTER TABLE public') && l.includes('ADD COLUMN IF NOT EXISTS')
    );
    expect(alters.length).toBeGreaterThanOrEqual(50);
  });

  it('envolve o script inteiro em BEGIN/COMMIT (erro = rollback total)', () => {
    expect(codeLines.filter((l) => l === 'BEGIN;').length).toBe(1);
    expect(codeLines.filter((l) => l === 'COMMIT;').length).toBe(1);
  });

  it('cita asset-photos com aspas em tabela e políticas', () => {
    expect(sql).toContain('public."asset-photos"');
    expect(codeLines.some((l) => l.includes('CREATE POLICY p_all ON public."asset-photos"')));
  });

  it('garante id e is_admin em user_permissions legada (upsert do app envia id: data.user.id)', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS id uuid');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false');
  });

  it('declara as colunas extras dos payloads reais (campaigns, campaign_snapshots, asset_logs)', () => {
    // Validação REST contra o banco vivo: o app envia description/created_by/start_date
    // (campaigns), assets_data/metadata/closed_at/closed_by (campaign_snapshots) e
    // user_email (asset_logs). Sem essas colunas, inserts reais quebrariam (PGRST204).
    // Além disso, o schema legado de campaigns pode ter unit_id NOT NULL que o
    // app nunca envia (23502 em todo INSERT) — o bootstrap o torna opcional.
    const extras = [
      'ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS description text;',
      'ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS created_by text;',
      'ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS start_date timestamptz;',
      'ALTER TABLE public.campaigns ALTER COLUMN IF EXISTS unit_id DROP NOT NULL;',
      'ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS assets_data jsonb;',
      'ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS metadata jsonb;',
      'ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS closed_at timestamptz;',
      'ALTER TABLE public.campaign_snapshots ADD COLUMN IF NOT EXISTS closed_by text;',
      'ALTER TABLE public.asset_logs ADD COLUMN IF NOT EXISTS user_email text;'
    ];
    for (const line of extras) {
      expect(sql).toContain(line);
    }
  });

  it('garante DEFAULT gen_random_uuid() no id das tabelas com upsert sem id explícito (corrige 23502)', () => {
    // A âncora GPS (saveUnitConfig → inventory_config) e os demais upserts por
    // índice único NÃO enviam `id`. Em schema legado sem DEFAULT no id, toda
    // gravação falharia com 23502 — o que impedia a âncora de chegar à nuvem.
    const ID_DEFAULT_TABLES = [
      'assets',
      'inventory_config',
      'locations',
      'campaigns',
      'campaign_snapshots',
      'asset_logs',
      'asset-photos'
    ];
    for (const t of ID_DEFAULT_TABLES) {
      const ident = t === 'asset-photos' ? '"asset-photos"' : t;
      expect(sql).toContain(`ALTER TABLE public.${ident} ALTER COLUMN id SET DEFAULT gen_random_uuid();`);
    }
  });
});
