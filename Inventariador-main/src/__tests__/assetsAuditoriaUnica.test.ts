// @vitest-environment node
// ============================================================================
// assetsAuditoriaUnica.test.ts — uma alteração em public.assets, uma linha de trilha.
//
// Dois triggers de auditoria na mesma tabela (`log_asset_changes` e
// `trg_audit_asset_changes`) gravavam a MESMA alteração em `public.asset_logs`,
// e a Auditoria mostrava pares de linhas. O contrato vive no SQL da base —
// este teste guarda-o contra regressões no script e no bootstrap.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raizApp = new URL('../../', import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, raizApp)), 'utf8');

const script = () => ler('scripts/assets-auditoria-unica.sql');
const bootstrap = () => ler('docs/supabase_bootstrap.sql');
const changelog = () => ler('CHANGELOG.md');

describe('public.assets — auditoria com um só escritor', () => {
  it('existe o script da base existente, dentro de uma transacção', () => {
    expect(existsSync(fileURLToPath(new URL('scripts/assets-auditoria-unica.sql', raizApp)))).toBe(true);

    const sql = script();
    expect(sql.trimStart().startsWith('--')).toBe(true);
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it('remove o trigger duplicado pela FUNÇÃO que escreve, não pelo nome do trigger', () => {
    const sql = script();

    // O nome do trigger varia por base; quem identifica o segundo escritor é
    // a função chamada por ele.
    expect(sql).toContain('JOIN pg_proc p ON p.oid = t.tgfoid');
    expect(sql).toContain("p.proname = 'log_asset_changes'");
    expect(sql).toContain('AND NOT t.tgisinternal');
    expect(sql).toContain("EXECUTE format('DROP TRIGGER %I ON public.assets', r.tgname)");
  });

  it('aborta em vez de deixar asset_logs sem trilha quando falta o escritor canónico', () => {
    const sql = script();

    expect(sql).toContain("p.proname = 'trg_audit_asset_changes'");
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('trg_audit_asset_changes ausente');

    // A trava tem de estar ANTES do DROP: um DROP primeiro já teria apagado o
    // segundo escritor quando a excepção saltasse.
    expect(sql.indexOf('RAISE EXCEPTION')).toBeLessThan(
      sql.indexOf("EXECUTE format('DROP TRIGGER %I ON public.assets'")
    );
  });

  it('aposenta log_asset_changes como pass-through e sem escrever em asset_logs', () => {
    const sql = script();
    const inicio = sql.indexOf('CREATE OR REPLACE FUNCTION public.log_asset_changes()');
    expect(inicio).toBeGreaterThan(-1);

    const corpo = sql.slice(inicio, sql.indexOf('$corpo$;', inicio));
    expect(corpo).toContain("IF TG_OP = 'DELETE' THEN");
    expect(corpo).toContain('RETURN OLD;');
    expect(corpo).toContain('RETURN NEW;');
    expect(corpo).not.toContain('asset_logs');
    expect(corpo).not.toContain('INSERT INTO');
  });

  it('é idempotente: não recria triggers nem escreve linhas', () => {
    const sql = script();

    // Só a versão sem argumentos é substituída; se não existir, avisa e segue.
    expect(sql).toContain("to_regprocedure('public.log_asset_changes()')");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toContain('CREATE TRIGGER');
    expect(sql).not.toContain('INSERT INTO');
  });

  it('o bootstrap das bases novas não reintroduz o segundo escritor', () => {
    expect(bootstrap()).not.toContain('log_asset_changes');
  });

  it('o CHANGELOG aponta o script da correcção', () => {
    expect(changelog()).toContain('scripts/assets-auditoria-unica.sql');
  });
});
