// src/__tests__/rlsTabelasLegadas.test.ts
// Regressão para docs/supabase_rls_tabelas_legadas.sql:
//  - `anon` perde o privilégio em TODAS as tabelas/views e sequências de public;
//  - as tabelas legadas que o app não consulta (tenants, filial,
//    camposAlterados) ficam com RLS e sem política (nega);
//  - unit_gps_data e o controlo patrimonial ficam por contrato (tenant_visible);
//  - log_inventario_termico (telemetria sem contrato) só aceita INSERT;
//  - tudo é condicional (to_regclass), para uma base sem estas tabelas não falhar.
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

const PATRIMONIO = [
  'chart_of_accounts',
  'asset_groups',
  'ncm_classifiers',
  'asset_movements',
  'asset_depreciation_history',
] as const;

describe('docs/supabase_rls_tabelas_legadas.sql — tabelas fora do bootstrap', () => {
  it('é transaccional, idempotente e não cria nenhum p_all', () => {
    const linhas = codigo(sql);
    expect(linhas.filter((l) => l === 'BEGIN;').length).toBe(1);
    expect(linhas.filter((l) => l === 'COMMIT;').length).toBe(1);
    expect(sql).not.toContain('CREATE POLICY p_all');
    expect(sql).toContain('DROP POLICY IF EXISTS p_all ON public.tenants');
  });

  it('recusa correr sem tenant_visible e não altera views sozinho', () => {
    expect(sql).toContain("to_regprocedure('public.tenant_visible(text)') IS NULL");
    expect(sql).toContain('RAISE EXCEPTION');
    // A correcção de views é só uma sugestão gerada na auditoria, não um ALTER
    // executado às cegas sobre um nome que o repositório não conhece.
    expect(codigo(sql).some((l) => l.startsWith('ALTER VIEW'))).toBe(false);
    expect(sql).toContain('security_invoker = true');
  });

  it('retira a anon tudo o que é tabela/view e sequência de public', () => {
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;');
    expect(sql).toContain('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;');
  });

  it.each([...PATRIMONIO])('%s fica por contrato, condicionada à coluna tenantid', (tabela) => {
    expect(sql).toContain(`to_regclass('public.${tabela}')`);
    expect(sql).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toContain(`REVOKE ALL ON public.${tabela} FROM anon;`);
    expect(sql).toContain(`CREATE POLICY p_tenant_all ON public.${tabela}`);
    expect(sql).toContain(`table_name = '${tabela}' AND column_name = 'tenantid'`);
    expect(sql).toContain('public.tenant_visible(tenantid)');
  });

  it.each(['tenants', 'filial', '"camposAlterados"'])(
    '%s (legado sem uso pelo app) fica com RLS e sem política',
    (tabela) => {
      expect(sql).toContain(`to_regclass('public.${tabela}')`);
      expect(sql).toContain(`ALTER TABLE public.${tabela} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`REVOKE ALL ON public.${tabela} FROM anon;`);
      expect(sql).not.toContain(`CREATE POLICY p_tenant_all ON public.${tabela}`);
      expect(sql).not.toContain(`CREATE POLICY p_authenticated_select ON public.${tabela}`);
    }
  );

  it('unit_gps_data mantém a política por contrato quando tem tenantid', () => {
    expect(sql).toContain("to_regclass('public.unit_gps_data')");
    expect(sql).toContain('CREATE POLICY p_tenant_all ON public.unit_gps_data');
    expect(sql).toContain("table_name = 'unit_gps_data' AND column_name = 'tenantid'");
  });

  it('log_inventario_termico só aceita INSERT autenticado (sem SELECT)', () => {
    expect(sql).toContain("to_regclass('public.log_inventario_termico')");
    expect(sql).toContain('CREATE POLICY p_authenticated_insert ON public.log_inventario_termico');
    expect(sql).toContain('FOR INSERT TO authenticated');
    expect(sql).not.toContain('CREATE POLICY p_authenticated_select ON public.log_inventario_termico');
    expect(sql).not.toContain('CREATE POLICY p_tenant_select ON public.log_inventario_termico');
  });

  it('traz a auditoria pronta: inventário, grants, views, matviews e funções de anon', () => {
    for (const consulta of [
      'pg_policies',
      'information_schema.role_table_grants',
      'information_schema.column_privileges',
      'aclexplode',
      'relkind = \'m\'',
      "has_function_privilege('anon'",
    ]) {
      expect(sql).toContain(consulta);
    }
  });
});
