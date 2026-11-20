// @vitest-environment node
// ============================================================================
// assetsConflictIndex.test.ts — o índice da chave de origem tem de servir de
// alvo para o upsert da fila.
//
// `processDataSyncQueue` (syncService) envia `upsert(payload, { onConflict:
// ASSETS_CONFLICT_TARGET })`, e `ASSETS_CONFLICT_TARGET` é 'tenantid,
// primarykey'. O PostgREST traduz isso para `ON CONFLICT (tenantid,
// primarykey)` — e o PostgreSQL só consegue inferir um índice único NÃO
// parcial. Com o predicado `WHERE primarykey IS NOT NULL` a inferência falha: a
// escrita vira INSERT, colide no próprio índice e o cartão mostra «FALHA DE
// ENVIO» com `23505 duplicate key … assets_tenant_primarykey_key` a cada ciclo,
// em vez de a linha ser actualizada.
//
// O contrato fica nos dois sítios que criam o índice: o bootstrap (bases novas)
// e o script de alinhamento (bases antigas).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raizApp = new URL('../../', import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, raizApp)), 'utf8');

const bootstrap = () => ler('docs/supabase_bootstrap.sql');
const script = () => ler('scripts/fix-assets-conflict-index.sql');
const syncService = () => ler('src/services/syncService.ts');

/** Só o SQL executável: o cabeçalho cita a definição defeituosa de propósito. */
const codigo = (sql: string): string =>
  sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

/** Colunas declaradas no CREATE UNIQUE INDEX … (a, b). */
const colunasDoIndice = (sql: string): string | undefined =>
  /CREATE UNIQUE INDEX[^;]*assets_tenant_primarykey_key\s+ON public\.assets \(([^)]+)\)/i.exec(sql)?.[1]
    ?.replace(/\s+/g, ' ')
    .trim();

describe('assets_tenant_primarykey_key — alvo de ON CONFLICT da fila', () => {
  it('as colunas do índice batem com o alvo usado pela fila', () => {
    const alvo = /ASSETS_CONFLICT_TARGET\s*=\s*'([^']+)'/.exec(syncService())?.[1];
    expect(alvo).toBe('tenantid, primarykey');
    expect(colunasDoIndice(codigo(bootstrap()))).toBe(alvo);
    expect(colunasDoIndice(codigo(script()))).toBe(alvo);
  });

  it('o bootstrap não cria o índice como parcial', () => {
    // O defeito: `… (tenantid, primarykey) WHERE primarykey IS NOT NULL`
    expect(codigo(bootstrap())).not.toMatch(/WHERE\s+primarykey\s+IS\s+NOT\s+NULL/i);
    // e a definição tem de terminar no parêntese das colunas
    expect(codigo(bootstrap())).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS assets_tenant_primarykey_key\s+ON public\.assets \(tenantid, primarykey\);/
    );
  });

  it('o script de alinhamento recria o índice sem predicado, para bases antigas', () => {
    expect(existsSync(fileURLToPath(new URL('scripts/fix-assets-conflict-index.sql', raizApp)))).toBe(true);

    const sql = codigo(script());
    expect(sql).not.toMatch(/WHERE\s+primarykey\s+IS\s+NOT\s+NULL/i);
    expect(sql).toContain('DROP INDEX IF EXISTS public.assets_tenant_primarykey_key;');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX assets_tenant_primarykey_key\s+ON public\.assets \(tenantid, primarykey\);/
    );
  });

  it('continua a ser único e por contrato (a unicidade nunca é global)', () => {
    for (const sql of [codigo(bootstrap()), codigo(script())]) {
      expect(sql).toContain('UNIQUE INDEX');
      expect(colunasDoIndice(sql)).toContain('tenantid');
    }
    // O índice global antigo (só por primarykey) não pode voltar.
    expect(codigo(bootstrap())).not.toMatch(/CREATE UNIQUE INDEX[^;]*ON public\.assets \(primarykey\)/i);
  });

  it('explica a causa no próprio SQL (ON CONFLICT / PostgREST)', () => {
    expect(bootstrap()).toMatch(/ON CONFLICT/);
    expect(script()).toMatch(/ON CONFLICT/);
    expect(script()).toMatch(/PostgREST/);
  });

  it('o script de alinhamento é idempotente e traz a repro com rollback', () => {
    const sql = codigo(script());
    expect(sql).toContain('DROP INDEX IF EXISTS');
    expect(sql).not.toMatch(/EXECUTE\s+'/);
    // a repro com `rollback` vive no cabeçalho, é documentação executável à mão
    expect(script()).toContain('rollback;');
  });
});
