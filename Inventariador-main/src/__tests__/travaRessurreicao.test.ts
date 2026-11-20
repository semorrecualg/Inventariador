// @vitest-environment node
// ============================================================================
// travaRessurreicao.test.ts — o servidor recusa `is_deleted = false` sem
// marca explícita de restauro.
//
// A guarda do cliente (#128) só vale para o APK que a tem. Um APK antigo — ou
// uma cópia local que nunca recebeu a exclusão — envia `is_deleted = false`
// sobre a linha apagada e o ativo volta para todos. A trava final tem de estar
// no Postgres: trigger BEFORE UPDATE que exige um `restored_at` novo.
//
// O contrato vive no SQL; este teste guarda-o (script da base actual e
// bootstrap das bases novas).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
const ler = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

const script = () => ler('scripts/assets-restauro-trigger.sql');
const bootstrap = () => ler('docs/supabase_bootstrap.sql');

describe('trava de ressurreição — schema', () => {
  it('existe o script da base actual', () => {
    expect(existsSync(join(raiz, 'scripts', 'assets-restauro-trigger.sql'))).toBe(true);
  });

  it('a marca de restauro é uma coluna própria (restored_at)', () => {
    expect(script()).toContain('ADD COLUMN IF NOT EXISTS restored_at timestamptz');
    expect(bootstrap()).toContain('ADD COLUMN IF NOT EXISTS restored_at timestamptz');
  });

  it('o trigger recusa pôr is_deleted = false sem um restored_at novo', () => {
    for (const sql of [script(), bootstrap()]) {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.assets_bloquear_ressurreicao\(\)/);
      expect(sql).toContain('IF OLD.is_deleted IS TRUE AND NEW.is_deleted IS NOT TRUE THEN');
      expect(sql).toContain('NEW.restored_at IS NULL');
      expect(sql).toContain('IS NOT DISTINCT FROM OLD.restored_at');
      expect(sql).toContain('RAISE EXCEPTION');
    }
  });

  it('o trigger é BEFORE UPDATE em public.assets e idempotente', () => {
    for (const sql of [script(), bootstrap()]) {
      expect(sql).toMatch(/CREATE TRIGGER assets_bloquear_ressurreicao\s+BEFORE UPDATE ON public\.assets\s+FOR EACH ROW/);
      expect(sql).toContain('DROP TRIGGER IF EXISTS assets_bloquear_ressurreicao ON public.assets');
    }
  });

  it('não usa SQL dinâmico (o bootstrap tem de correr no SQL Editor)', () => {
    const dinamico = bootstrap()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'))
      .filter((l) => (/^(EXECUTE\s)/i.test(l) && !/^EXECUTE\s+(?:FUNCTION|PROCEDURE)\b/i.test(l)) || /format\(/.test(l));

    expect(dinamico).toEqual([]);
  });
});
