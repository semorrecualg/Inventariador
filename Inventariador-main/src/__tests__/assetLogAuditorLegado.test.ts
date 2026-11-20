// @vitest-environment node
// ============================================================================
// assetLogAuditorLegado.test.ts — a auditoria de ativos não pode abortar escritas.
//
// `log_asset_changes()` é criada na base, fora do repositório, e gravava
// `NEW._auditor` em `asset_logs.user_email`. `_auditor` é a coluna legada (nome
// vindo da planilha, do tipo «ADMINISTRADOR GLOBAL»); o app grava `auditor`. Nas
// linhas com `_auditor` nulo o INSERT recebia NULL, e num projecto com
// `user_email NOT NULL` a transacção inteira abortava com 23502: toda a UPDATE
// desses ativos falhava — incluindo o restauro, que passava na trava
// `assets_bloquear_ressurreicao` e estourava na auditoria.
//
// O contrato fica no SQL: este teste impede que a função volte a ler a coluna
// legada como e-mail, e impede que o fallback desapareça.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raizApp = new URL('../../', import.meta.url);
const ler = (rel: string) => readFileSync(fileURLToPath(new URL(rel, raizApp)), 'utf8');
const script = () => ler('scripts/fix-asset-log-auditor-legado.sql');
/** Só o SQL executável: o cabeçalho cita o defeito e não é contrato. */
const codigo = () =>
  script()
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

describe('log_asset_changes() — e-mail da auditoria nunca é NULL', () => {
  it('o script existe e substitui a função na base existente', () => {
    expect(existsSync(fileURLToPath(new URL('scripts/fix-asset-log-auditor-legado.sql', raizApp)))).toBe(true);
    expect(script()).toContain('CREATE OR REPLACE FUNCTION public.log_asset_changes()');
  });

  it('não usa a coluna legada como user_email (a causa do 23502)', () => {
    // A assinatura do defeito: o INSERT … VALUES (NEW.id::text, NEW._auditor, …)
    expect(codigo()).not.toContain('NEW._auditor');
    // e a coluna legada continua a ser lida, mas por chave no jsonb (não rebenta 42703)
    expect(codigo()).toContain("to_jsonb(NEW) ->> '_auditor'");
  });

  it('resolve o e-mail por coalesce: auditor, legada, JWT e fallback do sistema', () => {
    const sql = codigo();
    expect(sql).toContain("to_jsonb(NEW) ->> 'auditor'");
    expect(sql).toContain("auth.jwt() ->> 'email'");
    expect(sql).toContain("'system@gbr.com.br'");

    // ordem: o que o app escreve primeiro, o fallback do sistema por último
    const posApp = sql.indexOf("to_jsonb(NEW) ->> 'auditor'");
    const posLegada = sql.indexOf("to_jsonb(NEW) ->> '_auditor'");
    const posJwt = sql.indexOf("auth.jwt() ->> 'email'");
    const posSistema = sql.indexOf("'system@gbr.com.br'");
    expect(posApp).toBeGreaterThan(-1);
    expect(posLegada).toBeGreaterThan(posApp);
    expect(posJwt).toBeGreaterThan(posLegada);
    expect(posSistema).toBeGreaterThan(posJwt);
  });

  it('nunca grava NULL: cada candidato é normalizado antes do coalesce', () => {
    const sql = codigo();
    // nullif(btrim(...), '') em todos os candidatos de texto — senão a string
    // vazia venceria o coalesce e a auditoria dizia «quem fez» com nada.
    expect(sql.match(/nullif\(btrim\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('mantém a escrita como passa e volta (trigger BEFORE UPDATE devolve NEW)', () => {
    const sql = codigo();
    expect(sql).toContain("'UPDATE'");
    expect(sql).toContain('RETURN NEW;');
  });

  it('é idempotente e sem SQL dinâmico', () => {
    const sql = script();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION');
    expect(sql).not.toMatch(/EXECUTE\s+'/);
    expect(sql).not.toMatch(/\bformat\s*\(/);
  });

  it('traz a verificação no próprio script (trigger → função e teste com rollback)', () => {
    const sql = script();
    expect(sql).toContain("from pg_trigger t join pg_proc p on p.oid = t.tgfoid");
    expect(sql).toContain('rollback;');
  });
});
