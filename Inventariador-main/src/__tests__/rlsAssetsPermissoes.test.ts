// src/__tests__/rlsAssetsPermissoes.test.ts
// Regressão para docs/supabase_rls_assets_permissoes.sql:
//  - `assets` sem p_all e limitado ao contrato (MASTER atravessa);
//  - `user_permissions` sem qualquer acesso de `anon`;
//  - login por username pela RPC email_by_username (só o e-mail);
//  - guarda BEFORE INSERT/UPDATE contra escalada de papel/contrato.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sqlRls = readFileSync(join(process.cwd(), 'docs', 'supabase_rls_assets_permissoes.sql'), 'utf8');
const sqlBootstrap = readFileSync(join(process.cwd(), 'docs', 'supabase_bootstrap.sql'), 'utf8');
const service = readFileSync(join(process.cwd(), 'src', 'services', 'supabaseService.ts'), 'utf8');

/** Linhas de código: remove comentários `--` e linhas vazias. */
const codigo = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'));

/** Corpo de uma função SQL (entre o `$$` de abertura e o `$$;`). */
const corpoFuncao = (sql: string, assinatura: string) => {
  const inicio = sql.indexOf(assinatura);
  expect(inicio).toBeGreaterThan(-1);
  const corpo = sql.slice(inicio);
  return corpo.slice(0, corpo.indexOf('$$;'));
};

describe('docs/supabase_rls_assets_permissoes.sql — exposição restante', () => {
  it('envolve tudo numa transacção e é idempotente', () => {
    const linhas = codigo(sqlRls);
    expect(linhas.filter((l) => l === 'BEGIN;').length).toBe(1);
    expect(linhas.filter((l) => l === 'COMMIT;').length).toBe(1);
    expect(sqlRls).toContain('DROP POLICY IF EXISTS p_all ON public.assets');
    expect(sqlRls).toContain('DROP POLICY IF EXISTS p_tenant_all ON public.assets');
    expect(sqlRls).toContain('CREATE POLICY p_tenant_all ON public.assets');
    for (const p of ['p_self_select', 'p_self_insert', 'p_self_update', 'p_admin_all']) {
      expect(sqlRls).toContain(`DROP POLICY IF EXISTS ${p} ON public.user_permissions`);
      expect(sqlRls).toContain(`CREATE POLICY ${p} ON public.user_permissions`);
    }
  });

  it('nenhuma política destas tabelas é dada a anon', () => {
    const politicas = sqlRls.split('CREATE POLICY').slice(1);
    expect(politicas.length).toBe(5);
    for (const p of politicas) {
      const cabecalho = p.slice(0, 200);
      expect(cabecalho).toContain('TO authenticated');
      expect(cabecalho).not.toMatch(/\bTO anon\b/);
    }
  });

  it('retira o privilégio de tabela a anon (defesa em profundidade)', () => {
    expect(sqlRls).toContain('REVOKE ALL ON public.assets FROM anon;');
    expect(sqlRls).toContain('REVOKE ALL ON public.user_permissions FROM anon;');
  });

  it('login por username usa RPC SECURITY DEFINER, só o e-mail e igualdade exata', () => {
    const corpo = corpoFuncao(sqlRls, 'FUNCTION public.email_by_username(p_username text)');
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toContain('SELECT up.email');
    expect(corpo).toContain('lower(btrim(coalesce(up.username');
    expect(corpo).not.toMatch(/\bilike\b/i);
    expect(corpo).not.toContain('SELECT *');
    expect(sqlRls).toContain(
      'GRANT EXECUTE ON FUNCTION public.email_by_username(text) TO anon, authenticated;'
    );
  });

  it('get_tenantid resolve o perfil pelo id e pelo e-mail (perfis legados)', () => {
    const corpo = corpoFuncao(sqlRls, 'FUNCTION public.get_tenantid()');
    expect(corpo).toContain('public.is_self_row');
    const selfRow = corpoFuncao(sqlRls, 'FUNCTION public.is_self_row(p_id uuid, p_email text)');
    expect(selfRow).toContain("auth.jwt() ->> 'email'");
    expect(selfRow).toContain('p_id = auth.uid()');
  });

  it('a guarda impede escalar o próprio papel/contrato', () => {
    const corpo = corpoFuncao(sqlRls, 'FUNCTION public.guard_user_permissions()');
    expect(corpo).toContain("TG_OP = 'INSERT'");
    expect(corpo).toContain("NEW.role := 'AUDITOR'");
    expect(corpo).toContain("NEW.tenantid := ''");
    expect(corpo).toContain('NEW.is_admin := false');
    expect(corpo).toContain("ERRCODE = '42501'");
    expect(corpo).toContain('NEW.tenantid IS DISTINCT FROM OLD.tenantid');
    expect(corpo).toContain('NEW.id IS DISTINCT FROM auth.uid()');
    expect(sqlRls).toContain('CREATE TRIGGER user_permissions_guard');
    expect(sqlRls).toContain('BEFORE INSERT OR UPDATE ON public.user_permissions');
  });

  it('só MASTER atravessa contratos; ADMIN fica no seu', () => {
    const master = corpoFuncao(sqlRls, 'FUNCTION public.is_master()');
    expect(master).toContain("upper(btrim(coalesce(up.role, ''))) = 'MASTER'");
    const policy = sqlRls.slice(sqlRls.indexOf('CREATE POLICY p_tenant_all ON public.assets'));
    const corpo = policy.slice(0, policy.indexOf('REVOKE ALL ON public.assets'));
    expect(corpo).toContain('public.is_master()');
    expect(corpo).toContain('public.get_tenantid()');
    // Sem contrato no perfil, a política não pode casar com linhas sem contrato.
    expect(corpo).toContain("btrim(coalesce(public.get_tenantid(), '')) <> ''");
  });
});

describe('docs/supabase_bootstrap.sql — mesmas regras', () => {
  it('não volta a criar p_all em assets nem em user_permissions', () => {
    expect(sqlBootstrap).not.toContain('CREATE POLICY p_all ON public.assets');
    expect(sqlBootstrap).not.toContain('CREATE POLICY p_all ON public.user_permissions');
    expect(sqlBootstrap).toContain('CREATE POLICY p_tenant_all ON public.assets');
    for (const p of ['p_self_select', 'p_self_insert', 'p_self_update', 'p_admin_all']) {
      expect(sqlBootstrap).toContain(`CREATE POLICY ${p} ON public.user_permissions`);
    }
  });

  it('cria as funções antes de as usar nas políticas', () => {
    for (const fn of [
      'get_tenantid',
      'is_self_row',
      'is_master',
      'is_tenant_admin',
      'email_by_username',
      'guard_user_permissions',
    ]) {
      expect(sqlBootstrap).toContain(`FUNCTION public.${fn}`);
    }
    const posFuncao = sqlBootstrap.indexOf('FUNCTION public.is_self_row');
    const posPolicy = sqlBootstrap.indexOf('CREATE POLICY p_tenant_all ON public.assets');
    expect(posPolicy).toBeGreaterThan(posFuncao);
    expect(sqlBootstrap).toContain('CREATE TRIGGER user_permissions_guard');
  });

  it('não deixa assets/user_permissions abertos a anon', () => {
    const politicas = sqlBootstrap.split('CREATE POLICY').slice(1);
    const destasTabelas = politicas.filter(
      (p) => p.slice(0, 200).includes('ON public.assets') || p.slice(0, 200).includes('ON public.user_permissions')
    );
    expect(destasTabelas.length).toBe(5);
    for (const p of destasTabelas) {
      expect(p.slice(0, 200)).not.toMatch(/\bTO anon\b/);
    }
    expect(sqlBootstrap).toContain('REVOKE ALL ON public.assets FROM anon;');
    expect(sqlBootstrap).toContain('REVOKE ALL ON public.user_permissions FROM anon;');
  });

  it('o login por username consulta a RPC (anon já não lê a tabela)', () => {
    const inicio = service.indexOf('export const getEmailByUsername');
    expect(inicio).toBeGreaterThan(-1);
    const fim = service.indexOf('export const provisionUserInAuth', inicio);
    const corpo = service.slice(inicio, fim);
    expect(corpo).toContain("rpc('email_by_username'");
  });
});

describe('auto-registo — o metadata do signUp não escolhe papel nem contrato', () => {
  const fontes = [
    ['supabase_rls_assets_permissoes.sql', sqlRls],
    ['supabase_bootstrap.sql', sqlBootstrap],
  ] as const;

  it.each(fontes)('%s: handle_new_user ignora role/tenantid/filial/units do metadata', (_nome, sql) => {
    const corpo = corpoFuncao(sql, 'FUNCTION public.handle_new_user()');
    expect(corpo).toContain("'AUDITOR'");
    expect(corpo).toContain('ARRAY[]::text[]');
    expect(corpo).not.toMatch(/->>\s*'role'/);
    expect(corpo).not.toMatch(/->>\s*'tenantid'/);
    expect(corpo).not.toMatch(/->>\s*'is_admin'/);
    expect(corpo).not.toMatch(/->>\s*'filial'/);
    expect(corpo).not.toMatch(/->>\s*'units'/);
    // Uma conta pré-criada pelo admin sem id adopta o id do Auth; uma já
    // vinculada não é reescrita pelo signUp.
    expect(corpo).toContain('WHERE public.user_permissions.id IS NULL');
  });

  it.each(fontes)('%s: substitui as variações antigas do trigger antes de criar o único', (_nome, sql) => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users');
    expect(sql).toContain('DROP TRIGGER IF EXISTS handle_new_user           ON auth.users');
    expect(sql).toContain('DROP TRIGGER IF EXISTS on_user_created           ON auth.users');
    expect(sql).toContain('CREATE TRIGGER on_auth_user_created');
    expect(sql).toContain('EXECUTE FUNCTION public.handle_new_user();');
    expect(sql.indexOf('CREATE TRIGGER on_auth_user_created')).toBeGreaterThan(
      sql.indexOf('FUNCTION public.handle_new_user()')
    );
  });

  it('os runbooks de signup deixam de copiar papel/contrato do metadata', () => {
    for (const doc of ['supabase_signup_500_correcao.sql', 'supabase_signup_500_diagnostico.sql']) {
      const sql = readFileSync(join(process.cwd(), 'docs', doc), 'utf8');
      const corpo = corpoFuncao(sql, 'FUNCTION public.handle_new_user()');
      expect(corpo).toContain("'AUDITOR'");
      expect(corpo).not.toMatch(/->>\s*'role'/);
      expect(corpo).not.toMatch(/->>\s*'tenantid'/);
      expect(corpo).not.toMatch(/->>\s*'is_admin'/);
    }
  });

  it('o ecrã de registo avisa que o vínculo é do administrador', () => {
    const register = readFileSync(join(process.cwd(), 'src', 'components', 'Register.tsx'), 'utf8');
    expect(register).toContain('auditor e sem contrato');
    expect(register).toContain('confirmado por um administrador');
  });
});
