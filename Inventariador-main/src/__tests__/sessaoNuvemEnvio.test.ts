// @vitest-environment jsdom
// ============================================================================
// sessaoNuvemEnvio.test.ts — o login local abre a sessão da nuvem e o envio
// recusa quando ela não existe.
//
// Em Base Oficial com rede, a credencial que autentica no Dexie/Barreira Local
// tem de trazer também o token do Supabase; sem ele o pedido chega ao PostgREST
// como `anon` e `assets` responde 42501 (ver utils/sessaoNuvem).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
};
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

let mod: typeof SupabaseService;
let auth: {
  getSession: () => Promise<unknown>;
  signInWithPassword: (credenciais: { email: string; password: string }) => Promise<unknown>;
  signOut: () => Promise<unknown>;
};

const sessao = (email = 'auditor@cicopal.com', token = 'jwt-válido') => ({
  data: { session: { access_token: token, user: { email } } },
  error: null
});

describe('sessão da nuvem no login local', () => {
  beforeAll(async () => {
    mod = await import('../services/supabaseService');
    auth = mod.supabase.auth as unknown as typeof auth;
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reaproveita a sessão já aberta do mesmo utilizador (sem novo signIn)', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue(sessao('Auditor@Cicopal.com') as never);
    const signIn = vi.spyOn(auth, 'signInWithPassword');

    await expect(mod.estabelecerSessaoNuvem('auditor@cicopal.com', 'senha')).resolves.toBe(true);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('sem sessão, autentica na nuvem com a credencial do login local', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    const signIn = vi.spyOn(auth, 'signInWithPassword').mockResolvedValue(sessao() as never);

    await expect(mod.estabelecerSessaoNuvem('auditor@cicopal.com', 'senha')).resolves.toBe(true);
    expect(signIn).toHaveBeenCalledWith({ email: 'auditor@cicopal.com', password: 'senha' });
  });

  it('uma sessão de OUTRO utilizador não serve: entra com a credencial dada', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue(sessao('outro@cicopal.com') as never);
    const signIn = vi.spyOn(auth, 'signInWithPassword').mockResolvedValue(sessao() as never);

    await expect(mod.estabelecerSessaoNuvem('auditor@cicopal.com', 'senha')).resolves.toBe(true);
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('sem senha não há como abrir sessão (biometria não guarda senha)', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    const signIn = vi.spyOn(auth, 'signInWithPassword');

    await expect(mod.estabelecerSessaoNuvem('auditor@cicopal.com')).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('credencial recusada na nuvem não derruba o login local', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    vi.spyOn(auth, 'signInWithPassword').mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials' }
    } as never);

    await expect(mod.estabelecerSessaoNuvem('auditor@cicopal.com', 'senha-errada')).resolves.toBe(false);
  });
});

describe('portão de sessão do envio', () => {
  beforeAll(async () => {
    mod = await import('../services/supabaseService');
    auth = mod.supabase.auth as unknown as typeof auth;
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem sessão, o envio é recusado com a ação certa', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);

    await expect(mod.garantirSessaoNuvemParaEnvio())
      .rejects.toBeInstanceOf(mod.SessaoNuvemAusenteError);
  });

  it('com sessão, o portão deixa passar', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue(sessao() as never);

    await expect(mod.garantirSessaoNuvemParaEnvio()).resolves.toBeUndefined();
  });

  it('o envio em massa não chega a tocar em `assets` quando não há sessão', async () => {
    vi.spyOn(auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    const from = vi.spyOn(mod.supabase as unknown as { from: (t: string) => unknown }, 'from');

    await expect(
      mod.syncAssetsToCloud(
        [{
          id: 'PK-1',
          primarykey: 'PK-1',
          tenantid: 'CICOPAL',
          filial: '010101 CICOPAL GO',
          etiqueta: '007222'
        } as never],
        'CICOPAL'
      )
    ).rejects.toBeInstanceOf(mod.SessaoNuvemAusenteError);

    expect(from).not.toHaveBeenCalled();
  });
});

describe('sessão do envio em massa não chega ao App', () => {
  beforeAll(async () => {
    mod = await import('../services/supabaseService');
    auth = mod.supabase.auth as unknown as typeof auth;
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
    mod.marcarSessaoDeEnvioEmMassa(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mod.marcarSessaoDeEnvioEmMassa(false);
  });

  it('a marca começa desligada e alterna', () => {
    expect(mod.isSessaoDeEnvioEmMassa()).toBe(false);
    mod.marcarSessaoDeEnvioEmMassa(true);
    expect(mod.isSessaoDeEnvioEmMassa()).toBe(true);
    mod.marcarSessaoDeEnvioEmMassa(false);
    expect(mod.isSessaoDeEnvioEmMassa()).toBe(false);
  });

  it('encerra a sessão e limpa a marca no sucesso', async () => {
    mod.marcarSessaoDeEnvioEmMassa(true);
    const signOut = vi.spyOn(auth, 'signOut').mockResolvedValue({ error: null } as never);

    await expect(mod.encerrarSessaoDeEnvioEmMassa()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(mod.isSessaoDeEnvioEmMassa()).toBe(false);
  });

  it('limpa a marca mesmo quando a saída da nuvem falha (o App não fica cego)', async () => {
    mod.marcarSessaoDeEnvioEmMassa(true);
    vi.spyOn(auth, 'signOut').mockRejectedValue(new Error('sem rede'));

    await expect(mod.encerrarSessaoDeEnvioEmMassa()).resolves.toBeUndefined();
    expect(mod.isSessaoDeEnvioEmMassa()).toBe(false);
  });
});
