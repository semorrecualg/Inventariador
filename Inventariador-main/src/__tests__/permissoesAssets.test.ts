// src/__tests__/permissoesAssets.test.ts
// Regressão do erro 42501 «permission denied for table assets»:
//  - o script de correção concede o que o app usa (SELECT/INSERT/UPDATE/DELETE
//    a anon e authenticated) em todas as tabelas, sem apagar dados;
//  - repõe a política p_all permissiva e recarrega o cache do PostgREST;
//  - o bootstrap passa a conceder o mesmo (projeto novo não nasce sem escrita);
//  - a prova (has_table_privilege) continua no script — é o que distingue
//    «corrigi» de «acho que corrigi».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** SQL sem comentários, com espaços normalizados e em minúsculas. */
const normalizar = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .toLowerCase();

/** O mesmo SQL, numa linha só (para instruções que o script parte em duas). */
const umaLinha = (sql: string) => sql.replace(/\s+/g, ' ');

const TABELAS = [
  'assets',
  'inventory_config',
  'unit_configs',
  'audit_logs',
  'asset_logs',
  'user_permissions',
  'locations',
  'campaigns',
  'campaign_snapshots',
  'asset-photos'
] as const;

const ident = (t: string) => (t === 'asset-photos' ? '"asset-photos"' : t);

const script = ler(join('scripts', 'assets-permissoes.sql'));
const scriptSql = normalizar(script);
const bootstrapSql = normalizar(ler(join('docs', 'supabase_bootstrap.sql')));

describe('scripts/assets-permissoes.sql — correção do 42501', () => {
  it('concede SELECT, INSERT, UPDATE e DELETE a anon e authenticated em cada tabela do app', () => {
    for (const t of TABELAS) {
      expect(scriptSql).toContain(
        `grant select, insert, update, delete on public.${ident(t)} to anon, authenticated;`
      );
    }
  });

  it('concede leitura do selo de geração (o app lê-o antes de enviar)', () => {
    expect(scriptSql).toContain('grant select on public.base_generation to anon, authenticated;');
  });

  it('dá ALL a service_role (ignora RLS, mas precisa do privilégio de tabela)', () => {
    expect(scriptSql).toContain('grant all privileges on public.assets to service_role;');
  });

  it('não apaga linhas, tabelas nem o schema', () => {
    const destrutivo = scriptSql
      .split('\n')
      .filter((l) => /^(delete from|truncate|drop table|drop schema|drop database)\b/.test(l));
    expect(destrutivo).toEqual([]);
  });

  it('repõe a política permissiva p_all e recarrega o cache do PostgREST', () => {
    expect(scriptSql).toContain(
      'create policy p_all on public.assets for all to anon, authenticated using (true) with check (true);'
    );
    expect(scriptSql).toContain("notify pgrst, 'reload schema';");
  });

  it('prova o resultado com has_table_privilege (INSERT/UPDATE para os dois papéis)', () => {
    expect(scriptSql).toContain("has_table_privilege('anon', 'public.assets', 'insert')");
    expect(scriptSql).toContain("has_table_privilege('anon', 'public.assets', 'update')");
    expect(scriptSql).toContain("has_table_privilege('authenticated', 'public.assets', 'insert')");
    expect(scriptSql).toContain("has_table_privilege('authenticated', 'public.assets', 'update')");
  });

  it('não usa SQL dinâmico (EXECUTE/format) — o SQL Editor do Supabase já falhou com 42601/26000', () => {
    const dinamico = scriptSql
      .split('\n')
      .filter((l) => /^execute\s/.test(l) || /format\(/.test(l));
    expect(dinamico).toEqual([]);
  });

  it('cita o erro e a tabela no cabeçalho, para ser encontrável por quem vê o cartão', () => {
    expect(script).toContain('42501');
    expect(script).toContain('permission denied for table assets');
  });
});

describe('docs/supabase_bootstrap.sql — o projeto novo nasce com escrita', () => {
  it('concede os mesmos privilégios das 10 tabelas do app', () => {
    for (const t of TABELAS) {
      expect(bootstrapSql).toContain(
        `grant select, insert, update, delete on public.${ident(t)} to anon, authenticated;`
      );
    }
  });

  it('concede USAGE no schema e leitura do selo de geração', () => {
    expect(bootstrapSql).toContain('grant usage on schema public to anon, authenticated;');
    expect(bootstrapSql).toContain('grant select on public.base_generation to anon, authenticated;');
  });

  it('mantém as tabelas futuras com os mesmos privilégios', () => {
    expect(umaLinha(bootstrapSql)).toContain(
      'alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;'
    );
  });
});
