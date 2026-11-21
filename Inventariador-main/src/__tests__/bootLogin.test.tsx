// @vitest-environment jsdom
// ============================================================================
// bootLogin.test.tsx — trilha de um login NOVO: LOGIN → BIOMETRIA → CONTRATO.
//
// O teste de `bootMount` cobre o separador novo (sessão reposta). Este cobre o
// outro lado: base local vazia, perfil sem filial e sem `app_last_work_context`,
// autenticação pela credencial do app, passo biométrico em fallback (jsdom não
// tem autenticador) e a escolha do contrato. O `#/unit` intermitente vinha do
// Boot Loader e da blindagem de base vazia; aqui confirma-se que a trilha nova
// não passa por lá.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { supabaseStub } = vi.hoisted(() => ({
  supabaseStub: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'sem conta na nuvem' }
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn().mockResolvedValue({ error: null })
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
      upsert: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}));

const { bootPlanSpy } = vi.hoisted(() => ({ bootPlanSpy: vi.fn() }));

// O arranque decide a filial do pull por `resolveBootPullPlan`. Espiar essa
// função dá um sinal estável de que a decisão correu — ao contrário do texto
// de um log, que se reformula sem mudar comportamento.
vi.mock('../utils/unitContextUtils', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveBootPullPlan: (...args: unknown[]) => {
      bootPlanSpy(...args);
      return (actual.resolveBootPullPlan as (...a: unknown[]) => unknown)(...args);
    }
  };
});

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    supabase: supabaseStub,
    // Sem nuvem a sério, o boot rebaixava para INTERNAL e o Boot Loader (o
    // sítio onde o arranque podia escrever UNIT_SELECTION) nem corria.
    getInitialDatabaseMode: () => 'SUPABASE',
    // Calculado no import a partir das credenciais: sem `.env` (CI) vale
    // `true` e o login forçava INTERNAL, onde o Boot Loader não corre.
    isInternalMode: false,
    testSupabaseConnection: async () => true
  };
});

// jsdom não tem autenticador: a política abre o fallback explícito — é o passo
// biométrico real da trilha, com dispensa auditada.
vi.mock('../services/biometricService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isBiometricSupported: async () => false,
    hasBiometricRegistered: async () => false,
    // Casco nativo com plugin sem biometria utilizável: a política abre o
    // fallback explícito — é o passo biométrico da trilha.
    isNativeAppShell: () => true,
    checkNativeBiometry: async () => ({ status: 'unavailable' })
  };
});

// O cliente Supabase abre realtime ao ser criado; sem WebSocket no ambiente.
vi.hoisted(() => {
  class WebSocketInerte {
    readyState = 1;
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    send() {}
    close() { this.readyState = 3; }
  }
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocketInerte;
});

import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import App from '../App';
import { localDb } from '../services/localDbService';
import { screenToPath } from '../router/routes';
import { AppScreen } from '../types';

const GESTOR = {
  username: 'gestor',
  name: 'Gestor do Contrato',
  email: 'gestor@cliente.com',
  password: 'senha123',
  role: 'ADMIN',
  is_admin: true,
  isAdmin: true,
  tenantid: 'CICOPAL',
  filial: 'TODAS'
};

let historicoEscrito: string[] = [];
let observer: MutationObserver | null = null;
let setItemSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
  sessionStorage.clear();
  // Modo nuvem (como no browser): o Boot Loader corre no arranque.
  localStorage.setItem('app_database_mode', 'SUPABASE');
  historicoEscrito = [];
  bootPlanSpy.mockClear();
  window.location.hash = '';
  delete (window as unknown as { __isImportingBatch?: boolean }).__isImportingBatch;

  await localDb.users.clear();
  await localDb.users.add(GESTOR as never);

  const setItemOriginal = Storage.prototype.setItem;
  setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    chave: string,
    valor: string
  ) {
    if (chave === 'gbr_kardek_history') historicoEscrito.push(valor);
    return setItemOriginal.call(this, chave, valor);
  });
});

afterEach(async () => {
  observer?.disconnect();
  observer = null;
  setItemSpy?.mockRestore();
  setItemSpy = null;
  cleanup();

  // Mesma blindagem do `bootMount`: o App continua a registar depois do
  // unmount e o worker do Vitest fechava a meio do `console`, deixando o CI
  // vermelho com todos os testes verdes. Enquanto o jsdom está vivo e o
  // console está stubado, esses logs não passam pelo RPC; os mocks só voltam
  // depois desta pausa.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  vi.restoreAllMocks();
});

describe('Login novo — LOGIN → biometria → CONTRATO', () => {
  it('perfil sem filial e sem última escolha não passa por /unit', async () => {
    expect(localStorage.getItem('app_last_work_context')).toBeNull();

    render(React.createElement(HashRouter, null, React.createElement(App)));

    // 1. Entra pelo formulário com a credencial do app.
    await waitFor(() => expect(screen.getByPlaceholderText('Digite seu usuário ou e-mail')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
      target: { value: GESTOR.email }
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: GESTOR.password } });
    fireEvent.submit(screen.getByText('Acessar Sistema').closest('form') as HTMLFormElement);

    // 2. Passo biométrico da trilha (fallback explícito no jsdom).
    const dispensar = await screen.findByText('Continuar sem biometria neste aparelho', {}, { timeout: 8000 });
    expect(window.location.hash).toBe(`#${screenToPath[AppScreen.BIOMETRIC_REGISTRATION]}`);
    fireEvent.click(dispensar);

    // 3. Segue para o CONTRATO DE TRABALHO — nunca para a unidade.
    await waitFor(() => {
      expect(window.location.hash).toBe(`#${screenToPath[AppScreen.WORK_CONTEXT_SELECTION]}`);
    }, { timeout: 8000 });

    // O Boot Loader corre depois do login e é quem podia empurrar a unidade:
    // espera pela decisão da filial e deixa a escrita assentar.
    await waitFor(() => {
      expect(bootPlanSpy).toHaveBeenCalled();
    }, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));

    const pilhas = historicoEscrito.map((valor) => JSON.parse(valor) as AppScreen[]);
    const destinos = pilhas.map((pilha) => pilha[pilha.length - 1]);
    expect(destinos).toContain(AppScreen.BIOMETRIC_REGISTRATION);
    expect(destinos).toContain(AppScreen.WORK_CONTEXT_SELECTION);
    // Qualquer escrita do arranque — de qualquer ecrã, em qualquer posição da
    // pilha — não pode conter UNIT_SELECTION. É o que falha se o Boot Loader
    // voltar a empurrar a unidade.
    expect(pilhas.flat()).not.toContain(AppScreen.UNIT_SELECTION);

    // O `init` do App ainda tem promessas por resolver; sem esta pausa ele
    // chama `setIsDataLoaded` depois de o jsdom fechar (EnvironmentTeardownError).
    await new Promise((r) => setTimeout(r, 1600));
  }, 30_000);
});
