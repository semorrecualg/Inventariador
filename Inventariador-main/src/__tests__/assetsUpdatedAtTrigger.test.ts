// @vitest-environment node
// ============================================================================
// assetsUpdatedAtTrigger.test.ts — o carimbo da nuvem tem de mudar em cada UPDATE.
//
// O pull delta baixa `updated_at > checkpoint` (fetchFullInventory, ETAPA 5b).
// A coluna `public.assets.updated_at` só tinha `DEFAULT now()`: valia no INSERT
// e nunca mais. Como o upsert da conferência actualiza a linha, a alteração
// feita num aparelho ficava invisível aos outros (o segundo telemóvel só a via
// num pull completo). O contrato fica no SQL — este teste guarda-o.
//
// `clock_timestamp()` e não `now()`: `now()` é o instante do BEGIN da
// transacção, igual para todas as linhas do lote. Duas actualizações do mesmo
// ativo no mesmo lote ficavam com o mesmo carimbo e a segunda era invisível ao
// `.gt('updated_at', checkpoint)`; e uma transacção longa carimbava a linha "no
// passado" de um checkpoint já distribuído.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raizApp = new URL('../../', import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, raizApp)), 'utf8');

const bootstrap = () => ler('docs/supabase_bootstrap.sql');
const scriptMigracao = () => ler('scripts/assets-updated-at-trigger.sql');

describe('assets.updated_at — trigger do servidor', () => {
  it('o script da base existente cria o trigger BEFORE UPDATE que carimba o servidor', () => {
    expect(existsSync(fileURLToPath(new URL('scripts/assets-updated-at-trigger.sql', raizApp)))).toBe(true);

    const sql = scriptMigracao();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.touch_updated_at()');
    expect(sql).toContain('NEW.updated_at := clock_timestamp()');
    expect(sql).not.toContain('NEW.updated_at := now()');
    expect(sql).toMatch(/CREATE TRIGGER assets_touch_updated_at\s+BEFORE UPDATE ON public\.assets\s+FOR EACH ROW/);
  });

  it('o script é idempotente (pode correr duas vezes sem rebentar)', () => {
    const sql = scriptMigracao();
    expect(sql).toContain('DROP TRIGGER IF EXISTS assets_touch_updated_at ON public.assets');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).toContain('ALTER COLUMN updated_at SET DEFAULT clock_timestamp()');
  });

  it('o bootstrap das bases novas traz o mesmo bloco', () => {
    const sql = bootstrap();
    expect(sql).toContain('NEW.updated_at := clock_timestamp()');
    expect(sql).not.toContain('NEW.updated_at := now()');
    expect(sql).toMatch(/CREATE TRIGGER assets_touch_updated_at\s+BEFORE UPDATE ON public\.assets/);
  });

  it('o backfill tira do limbo as linhas sem carimbo (nunca entram no delta)', () => {
    expect(scriptMigracao()).toContain('WHERE updated_at IS NULL');
    expect(bootstrap()).toContain('WHERE updated_at IS NULL');
  });
});
