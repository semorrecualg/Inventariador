// @vitest-environment jsdom
// ============================================================================
// syncUsersProtection.test.ts — Regressão: a atribuição usuário×contrato na
// NUVEM (user_permissions.tenantid) NUNCA pode ser apagada por um valor vazio
// vindo do dispositivo local.
//
// Bug real: o cache local (localStorage.app_users) tinha semorr@gmail.com com
// tenantid '' e o syncUsersToCloud fazia upsert cego com onConflict:'email',
// sobrescrevendo o CICOPAL atribuído na nuvem. O ensureUserProfile tinha o
// mesmo risco no caminho de fallback (upsert com fallbackTenant vazio).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import type { User } from '../types';
import { UserRole } from '../types';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com');

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

// Estado por teste
let cloudRows: { email: string; tenantid: string; filial?: string }[] = [];
let upsertCalls: { rows: Record<string, unknown>[]; opts?: { onConflict?: string; ignoreDuplicates?: boolean } }[] = [];

function buildFakeSupabase() {
  const from = vi.fn(() => {
    const state: {
      selectCols: string; single: boolean; eq: Record<string, string>; inVals: string[] | null;
      upsertRows: Record<string, unknown>[] | null; upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean };
    } = { selectCols: '', single: false, eq: {}, inVals: null, upsertRows: null };
    const chain: Record<string, unknown> = {};
    chain.select = (cols: string) => { state.selectCols = cols; return chain; };
    chain.eq = (c: string, v: string) => { state.eq[c] = v; return chain; };
    chain.in = (_c: string, v: string[]) => { state.inVals = v; return chain; };
    chain.single = () => { state.single = true; return chain; };
    chain.upsert = (rows: Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
      state.upsertRows = rows; state.upsertOpts = opts; return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => {
      let result: { data: unknown; count?: number; error: unknown };
      if (state.upsertRows) {
        upsertCalls.push({ rows: state.upsertRows, opts: state.upsertOpts });
        if (state.single) {
          result = { data: state.upsertRows[0] || null, error: null };
        } else {
          result = { data: null, error: null };
        }
      } else if (state.inVals) {
        const wanted = new Set(state.inVals.map((e) => e.toLowerCase()));
        result = {
          data: cloudRows.filter((r) => wanted.has(String(r.email || '').toLowerCase())),
          error: null,
        };
      } else if (state.single) {
        // select * eq email single → não encontrado (força o caminho de upsert)
        result = { data: null, error: { message: 'no rows' } };
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(resolve);
    };
    return chain;
  });
  return { from };
}

let syncUsersToCloud: typeof import('../services/supabaseService').syncUsersToCloud;
let ensureUserProfile: typeof import('../services/supabaseService').ensureUserProfile;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  cloudRows = [];
  upsertCalls = [];
  createClientMock.mockReturnValue(buildFakeSupabase());
  const mod = await import('../services/supabaseService');
  syncUsersToCloud = mod.syncUsersToCloud;
  ensureUserProfile = mod.ensureUserProfile;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('syncUsersToCloud — nunca apaga o tenantid atribuído na nuvem', () => {
  it('preserva o tenantid CICOPAL da nuvem quando o local está vazio', async () => {
    cloudRows = [{ email: 'semorr@gmail.com', tenantid: 'CICOPAL' }];
    // Dispositivo local com cache antigo SEM o contrato (bug real)
    const localUsers: User[] = [
      { email: 'semorr@gmail.com', username: 'ADMINISTRADOR', role: UserRole.ADMIN, tenantid: '', units: [] },
      { email: 'auditor.teste@gmail.com', username: 'auditor.teste', role: UserRole.AUDITOR, tenantid: 'CICOPAL', units: ['010201 SNACKS PA'] },
    ];

    await syncUsersToCloud(localUsers);

    expect(upsertCalls.length).toBe(1);
    const semorr = upsertCalls[0].rows.find((u) => u.email === 'semorr@gmail.com');
    // O upsert recebeu CICOPAL (vindo da nuvem), NUNCA vazio
    expect(semorr?.tenantid).toBe('CICOPAL');
    const auditor = upsertCalls[0].rows.find((u) => u.email === 'auditor.teste@gmail.com');
    expect(auditor?.tenantid).toBe('CICOPAL');
  });

  it('insere com tenantid vazio quando a nuvem também não tem atribuição (dono global legítimo)', async () => {
    cloudRows = [];
    const localUsers: User[] = [
      { email: 'novo.global@example.com', username: 'global', role: UserRole.ADMIN, tenantid: '', units: [] },
    ];

    await syncUsersToCloud(localUsers);

    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].rows[0].tenantid).toBe('');
  });
});

describe('ensureUserProfile — upsert de fallback não sobrescreve linha existente', () => {
  it('usa ignoreDuplicates no upsert para proteger a atribuição existente', async () => {
    const profile = await ensureUserProfile('auditor@example.com');

    // Caminho: fetch não encontrou → upsert com ignoreDuplicates
    expect(upsertCalls.length).toBe(1);
    expect(upsertCalls[0].opts?.onConflict).toBe('email');
    expect(upsertCalls[0].opts?.ignoreDuplicates).toBe(true);
    // Perfil devolvido para o login
    expect(profile.email).toBe('auditor@example.com');
    expect(profile.role).toBe('AUDITOR');
  });
});
