// src/__tests__/rlsTabelasRestantes.test.ts
// Regressão para docs/supabase_rls_tabelas_restantes.sql:
//  - `anon` deixa de ler/escrever inventory_config, audit_logs, locations,
//    campaigns, campaign_snapshots, asset_logs e base_generation;
//  - tudo fica limitado ao contrato (MASTER atravessa; perfil sem contrato só
//    alcança linhas sem contrato);
//  - a trilha e os laudos são append-only (sem UPDATE/DELETE);
//  - a fila de auditoria passa a `ignoreDuplicates` (ON CONFLICT DO NOTHING),
//    que é o que mantém o reenvio idempotente sem política de UPDATE;
//  - o bootstrap repete as mesmas políticas (sem divergir do ficheiro).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sqlNovo = readFileSync(join(process.cwd(), 'docs', 'supabase_rls_tabelas_restantes.sql'), 'utf8');
const sqlBootstrap = readFileSync(join(process.cwd(), 'docs', 'supabase_bootstrap.sql'), 'utf8');
const filaAuditoria = readFileSync(join(process.cwd(), 'src', 'services', 'auditoriaNuvem.ts'), 'utf8');

const TABELAS = [
  'inventory_config',
  'unit_configs',
  'audit_logs',
  'locations',
  'campaigns',
  'campaign_snapshots',
  'asset_logs',
  'base_generation',
] as const;

/** Linhas de código: remove comentários `--` e linhas vazias. */
const codigo = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'));

/** Corpo de uma função SQL (da assinatura até ao fecho `$fn$;`). */
const corpoFuncao = (sql: string, assinatura: string) => {
  const inicio = sql.indexOf(assinatura);
  expect(inicio).toBeGreaterThan(-1);
  const corpo = sql.slice(inicio);
  return corpo.slice(0, corpo.indexOf('$fn$;'));
};

describe('docs/supabase_rls_tabelas_restantes.sql — tabelas de operação', () => {
  it('envolve tudo numa transacção, é idempotente e retira o p_all das 7 tabelas', () => {
    const linhas = codigo(sqlNovo);
    expect(linhas.filter((l) => l === 'BEGIN;').length).toBe(1);
    expect(linhas.filter((l) => l === 'COMMIT;').length).toBe(1);
    expect(linhas.some((l) => l.startsWith('CREATE POLICY p_all'))).toBe(false);
    for (const t of TABELAS) {
      expect(linhas).toContain(`DROP POLICY IF EXISTS p_all ON public.${t};`);
      expect(linhas).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('nenhuma política destas tabelas alcança anon', () => {
    const politicas = codigo(sqlNovo).filter((l) => l.startsWith('CREATE POLICY'));
    expect(politicas.length).toBe(11);
    for (const p of politicas) {
      expect(p).toContain('TO authenticated');
      expect(p).not.toMatch(/\bTO anon\b/);
    }
  });

  it('retira o privilégio de tabela a anon (defesa em profundidade)', () => {
    for (const t of TABELAS) {
      expect(sqlNovo).toContain(`REVOKE ALL ON public.${t} FROM anon;`);
    }
  });

  it('tenant_visible(): MASTER atravessa, contrato igual ou ambos sem contrato', () => {
    const corpo = corpoFuncao(sqlNovo, 'FUNCTION public.tenant_visible(p_tenantid text)');
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toContain('public.is_master()');
    expect(corpo).toContain('public.get_tenantid()');
    // Perfil com contrato só casa com o mesmo contrato…
    expect(corpo).toContain("btrim(coalesce(public.get_tenantid(), '')) <> ''");
    // …e perfil sem contrato só alcança linhas também sem contrato.
    expect(corpo).toContain("btrim(coalesce(public.get_tenantid(), '')) = ''");
    expect(sqlNovo).toContain('GRANT EXECUTE ON FUNCTION public.tenant_visible(text) TO authenticated;');
    expect(sqlNovo).toContain('REVOKE ALL ON FUNCTION public.tenant_visible(text) FROM anon;');
  });

  it('a função é criada antes das políticas que a usam', () => {
    const posFuncao = sqlNovo.indexOf('FUNCTION public.tenant_visible');
    expect(posFuncao).toBeGreaterThan(-1);
    expect(sqlNovo.indexOf('CREATE POLICY p_tenant_all ON public.inventory_config')).toBeGreaterThan(posFuncao);
    expect(sqlNovo.indexOf('CREATE POLICY p_tenant_select ON public.audit_logs')).toBeGreaterThan(posFuncao);
  });

  it('trilha e laudos são append-only: só SELECT e INSERT', () => {
    for (const t of ['audit_logs', 'asset_logs', 'campaign_snapshots']) {
      expect(sqlNovo).toContain(`CREATE POLICY p_tenant_select ON public.${t}`);
      expect(sqlNovo).toContain(`CREATE POLICY p_tenant_insert ON public.${t}`);
      expect(sqlNovo).not.toMatch(
        new RegExp(`CREATE POLICY \\w+ ON public\\.${t}\\s+FOR (?:UPDATE|DELETE|ALL)`)
      );
    }
    // As políticas não referenciam `tenant_id`: numa base onde a coluna não
    // existe isso rebentava o script com 42703. A grafia legada é copiada para
    // `tenantid` por um trigger que a lê via `to_jsonb`.
    const policyAudit = sqlNovo.slice(
      sqlNovo.indexOf('CREATE POLICY p_tenant_select ON public.audit_logs'),
      sqlNovo.indexOf('REVOKE ALL ON public.audit_logs')
    );
    expect(policyAudit).toContain('public.tenant_visible(tenantid)');
    expect(sqlNovo).not.toContain('coalesce(tenantid, tenant_id)');
    const trigger = corpoFuncao(sqlNovo, 'FUNCTION public.tenantid_de_log_legado()');
    expect(trigger).toContain("to_jsonb(NEW) ->> 'tenant_id'");
    expect(trigger).toContain('NEW.tenantid');
    for (const t of ['audit_logs', 'asset_logs']) {
      expect(sqlNovo).toContain(`BEFORE INSERT ON public.${t}`);
    }
  });

  it('base_generation é só leitura para authenticated (escrita no SQL Editor)', () => {
    const policy = sqlNovo.slice(
      sqlNovo.indexOf('CREATE POLICY p_authenticated_select ON public.base_generation'),
      sqlNovo.indexOf('REVOKE ALL ON public.base_generation')
    );
    expect(policy).toContain('FOR SELECT TO authenticated');
    expect(policy).not.toMatch(/FOR (?:INSERT|UPDATE|DELETE|ALL)/);
  });

  it('é autónomo: cria as funções de que precisa (sem bloco DO nem pré-requisito)', () => {
    // Um editor que execute por linhas/trechos parte um `DO $$ … $$` e uma
    // função multi-linha; cada instrução fica completa numa só linha.
    for (const fn of ['get_tenantid', 'is_self_row', 'is_master', 'tenant_visible', 'tenantid_de_log_legado']) {
      expect(sqlNovo).toContain(`FUNCTION public.${fn}`);
    }
    expect(sqlNovo).not.toMatch(/^DO \$\$/m);
    expect(sqlNovo).not.toContain('to_regprocedure');
    // Uma instrução por linha: nenhuma linha começa por USING/WITH CHECK.
    for (const linha of codigo(sqlNovo)) {
      expect(linha.startsWith('USING') || linha.startsWith('WITH CHECK')).toBe(false);
    }
  });

  it('fecha unit_configs: era o último p_all para anon', () => {
    expect(sqlNovo).toContain('CREATE POLICY p_tenant_all ON public.unit_configs');
    expect(sqlNovo).toContain('REVOKE ALL ON public.unit_configs FROM anon;');
    expect(sqlNovo).toContain('ALTER TABLE public.unit_configs ENABLE ROW LEVEL SECURITY;');
    expect(sqlNovo).not.toContain('CREATE POLICY p_all ON public.unit_configs');
  });
});

describe('docs/supabase_bootstrap.sql — mesmas políticas (paridade)', () => {
  it('nenhuma das 8 tabelas volta a criar p_all', () => {
    for (const t of TABELAS) {
      expect(sqlBootstrap).not.toContain(`CREATE POLICY p_all ON public.${t}`);
      expect(sqlBootstrap).toContain(`REVOKE ALL ON public.${t} FROM anon;`);
    }
  });

  it('cria tenant_visible antes de a usar e define as políticas por contrato', () => {
    const posFuncao = sqlBootstrap.indexOf('FUNCTION public.tenant_visible');
    expect(posFuncao).toBeGreaterThan(sqlBootstrap.indexOf('FUNCTION public.is_master'));
    for (const t of ['inventory_config', 'unit_configs', 'locations', 'campaigns']) {
      expect(sqlBootstrap).toContain(`CREATE POLICY p_tenant_all ON public.${t}`);
      expect(sqlBootstrap.indexOf(`CREATE POLICY p_tenant_all ON public.${t}`)).toBeGreaterThan(posFuncao);
    }
    for (const t of ['audit_logs', 'asset_logs', 'campaign_snapshots']) {
      expect(sqlBootstrap).toContain(`CREATE POLICY p_tenant_select ON public.${t}`);
      expect(sqlBootstrap).toContain(`CREATE POLICY p_tenant_insert ON public.${t}`);
    }
    expect(sqlBootstrap).toContain('CREATE POLICY p_authenticated_select ON public.base_generation');
  });

  it('as trilhas do bootstrap também não ganham UPDATE/DELETE', () => {
    // O bootstrap copia a grafia legada para `tenantid` e não a referencia nas
    // políticas (42703 numa base sem essa coluna).
    expect(sqlBootstrap).toContain('FUNCTION public.tenantid_de_log_legado()');
    for (const t of ['audit_logs', 'asset_logs']) {
      expect(sqlBootstrap).toContain(`BEFORE INSERT ON public.${t}`);
    }
    expect(sqlBootstrap).not.toContain('public.tenant_visible(coalesce(tenantid, tenant_id))');

    for (const t of ['audit_logs', 'asset_logs', 'campaign_snapshots']) {
      expect(sqlBootstrap).not.toMatch(
        new RegExp(`CREATE POLICY \\w+ ON public\\.${t}\\s+FOR (?:UPDATE|DELETE|ALL)`)
      );
    }
  });
});

describe('fila de auditoria — escrita compatível com a trilha append-only', () => {
  it('reenvia com ignoreDuplicates (ON CONFLICT DO NOTHING), sem exigir UPDATE', () => {
    expect(filaAuditoria).toContain("onConflict: 'client_event_id', ignoreDuplicates: true");
  });
});
