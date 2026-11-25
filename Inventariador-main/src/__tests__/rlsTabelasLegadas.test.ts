// src/__tests__/rlsTabelasLegadas.test.ts
// Regressão para docs/supabase_rls_tabelas_legadas.sql:
//  - sem blocos DO: cada instrução é autónoma (um fragmento enviado pelo editor
//    não pode apanhar um `IF`/`BEGIN` solto — foi o 42601 em produção);
//  - `anon` perde o privilégio em TODAS as tabelas/views e sequências de public;
//  - o DDL por tabela é GERADO (só leitura) e condicionado à existência da
//    tabela e da coluna `tenantid`;
//  - legado sem uso pelo app fica sem política (nega); património por contrato;
//    telemetria só com INSERT autenticado;
//  - traz a auditoria de views (security_invoker), matviews e funções de anon.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(process.cwd(), 'docs', 'supabase_rls_tabelas_legadas.sql'), 'utf8');

/** Linhas de código: remove comentários `--` e linhas vazias. */
const codigo = (texto: string) =>
  texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'));

const TABELAS = [
  'tenants',
  'filial',
  '"camposAlterados"',
  'unit_gps_data',
  'chart_of_accounts',
  'asset_groups',
  'ncm_classifiers',
  'asset_movements',
  'asset_depreciation_history',
  'log_inventario_termico',
] as const;

describe('docs/supabase_rls_tabelas_legadas.sql — legado e módulo patrimonial', () => {
  it('não tem blocos DO/IF soltos: cada instrução corre isolada', () => {
    const linhas = codigo(sql);
    expect(linhas.some((l) => /^DO\b/.test(l))).toBe(false);
    expect(linhas.some((l) => /^IF\b/.test(l))).toBe(false);
    expect(linhas.some((l) => /^BEGIN$/.test(l))).toBe(false);
    expect(linhas.some((l) => l.includes('$$'))).toBe(false);
  });

  it('fecha o anon em todas as tabelas/views e sequências de public', () => {
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;');
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;');
  });

  it('gera DDL para as 10 tabelas, condicionado à existência e ao tenantid', () => {
    for (const t of TABELAS) {
      expect(sql).toContain(`('${t}', `);
    }
    expect(sql).toContain("to_regclass('public.' || a.tabela) IS NOT NULL AS existe");
    expect(sql).toContain("c.column_name = 'tenantid'");
    expect(sql).toContain("format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY;', e.tabela)");
    expect(sql).toContain("format('DROP POLICY IF EXISTS %I ON public.%s;', p.policyname, e.tabela)");
    // O texto gerado é idempotente mesmo reaplicado sem regenerar.
    expect(sql).toContain("format('DROP POLICY IF EXISTS p_tenant_all ON public.%s;', e.tabela)");
    expect(sql).toContain("format('DROP POLICY IF EXISTS p_authenticated_insert ON public.%s;', e.tabela)");
    expect(sql).toContain("format('REVOKE ALL ON public.%s FROM anon;', e.tabela)");
    expect(sql).toContain('string_agg(p.sql');
  });

  it('as patrimoniais e o unit_gps_data ficam por contrato; a telemetria só INSERT', () => {
    expect(sql).toContain(
      "format('CREATE POLICY p_tenant_all ON public.%s FOR ALL TO authenticated USING (public.tenant_visible(tenantid)) WITH CHECK (public.tenant_visible(tenantid));', e.tabela)"
    );
    expect(sql).toContain(
      "format('CREATE POLICY p_authenticated_insert ON public.%s FOR INSERT TO authenticated WITH CHECK (true);', e.tabela)"
    );
    // Só as tabelas com modo 'tenant' recebem a política por contrato.
    expect(sql).toContain("WHEN e.modo = 'tenant' AND e.tem_tenantid THEN");
    expect(sql).toContain("WHEN e.modo = 'insert' THEN");
    // tenants/filial/camposAlterados: modo 'fechar' (nenhuma política criada).
    expect(sql).toMatch(/\('tenants', 'fechar'\)/);
    expect(sql).toMatch(/\('filial', 'fechar'\)/);
    expect(sql).toMatch(/\('"camposAlterados"', 'fechar'\)/);
    expect(sql).not.toContain('p_authenticated_select');
  });

  it('não recria nenhum p_all nem política para anon', () => {
    expect(sql).not.toContain('CREATE POLICY p_all');
    expect(sql).not.toMatch(/CREATE POLICY[^;]*TO anon/);
    expect(sql).not.toContain('TO anon, authenticated');
  });

  it('traz a auditoria pronta: inventário, grants, views, matviews e funções de anon', () => {
    for (const consulta of [
      'pg_policies',
      'information_schema.role_table_grants',
      'information_schema.column_privileges',
      'aclexplode',
      "relkind = 'm'",
      "has_function_privilege('anon'",
      'security_invoker = true',
    ]) {
      expect(sql).toContain(consulta);
    }
  });
});
