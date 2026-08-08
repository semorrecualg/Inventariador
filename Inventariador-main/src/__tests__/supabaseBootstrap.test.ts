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
});
