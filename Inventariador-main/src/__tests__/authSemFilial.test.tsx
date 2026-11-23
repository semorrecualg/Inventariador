// @vitest-environment jsdom
// ============================================================================
// authSemFilial.test.tsx — login na NUVEM com contrato mas sem filial.
//
// Regressão do modal «SESSÃO EXPIRADA · Identificador de Contrato ou Filial
// ausente para isolamento do banco RLS. Por favor, reautentique.» que aparecia
// no browser logo depois de um login válido: o perfil tinha `tenantid` em
// `user_permissions` e nenhuma `filial`/`units`. O `processSession` tratava os
// dois casos como um só, fazia `signOut` e mandava reautenticar — o que nunca
// preenche a filial do perfil (beco sem saída).
//
// Comportamento esperado agora: contrato presente + filial ausente = sessão
// mantida e entrada no CONTRATO DE TRABALHO (/contexto), onde a filial é
// escolhida (o sync espera essa escolha). Sem CONTRATO a sessão continua a ser
// encerrada — sem contrato não há banco a isolar.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const PERFIL_SEM_FILIAL = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'gestor@cliente.com',
  username: 'gestor',
  name: 'Gestor do Contrato',
  role: 'ADMIN',
  is_admin: true,
  isAdmin: true,
  tenantid: 'CICOPAL',
  filial: '',
  units: []
};

const { supabaseStub, signOutSpy } = vi.hoisted(() => {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const sessao = {
    access_token: 'token',
    refresh_token: 'refresh',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'gestor@cliente.com',
      user_metadata: {},
      app_metadata: {}
    }
  };
  return {
    signOutSpy: signOut,
    supabaseStub: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: sessao }, error: null }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'off' } }),
        signOut
      },
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          limit: vi.fn().mockResolvedValue({ data: [], error: null })
        })),
        upsert: vi.fn().mockResolvedValue({ error: null })
      }))
    }
  };
});

// O cliente Supabase abre realtime ao ser criado; jsdom não tem WebSocket.
vi.hoisted(() => {
  class WebSocketInerte {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readyState = 1;
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    send() {}
    close() { this.readyState = 3; }
  }
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocketInerte;
});

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    supabase: supabaseStub,
    getInitialDatabaseMode: () => 'SUPABASE',
    isInternalMode: false,
    testSupabaseConnection: async () => true,
    // Perfil real da tabela user_permissions: contrato preenchido, filial vazia.
    ensureUserProfile: async () => ({ ...PERFIL_SEM_FILIAL })
  };
});

// jsdom não tem autenticador: a esteira abre o fallback explícito.
vi.mock('../services/biometricService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    isBiometricSupported: async () => false,
    hasBiometricRegistered: async () => false,
    isNativeAppShell: () => true,
    checkNativeBiometry: async () => ({ status: 'unavailable' })
  };
});

import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { assentarEAntesDoTeardown, silenciarConsoleDoArranque } from './helpers/teardownBlindado';
import { screenToPath } from '../router/routes';
import { AppScreen } from '../types';

let textosVistos: string[] = [];
let observer: MutationObserver | null = null;

const registarTexto = () => {
  textosVistos.push((document.body.textContent || '').replace(/\s+/g, ' '));
};

beforeEach(() => {
  silenciarConsoleDoArranque();
  localStorage.clear();
  sessionStorage.clear();
  textosVistos = [];
  signOutSpy.mockClear();
  window.location.hash = '';
  observer = new MutationObserver(registarTexto);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});

afterEach(async () => {
  observer?.disconnect();
  observer = null;
  await assentarEAntesDoTeardown(cleanup);
});

describe('Login na nuvem — perfil com contrato e sem filial', () => {
  it('mantém a sessão e abre o CONTRATO DE TRABALHO em vez de «Sessão Expirada»', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(App)));
    registarTexto();

    // 1. A sessão do Supabase é aceite: o perfil entra com o contrato dele.
    await waitFor(() => {
      const sessao = JSON.parse(sessionStorage.getItem('app_current_user') || 'null');
      expect(sessao).not.toBeNull();
      expect(sessao.tenantid).toBe('CICOPAL');
    }, { timeout: 15_000 });

    // 2. Nada de signOut nem do modal que mandava reautenticar.
    expect(signOutSpy).not.toHaveBeenCalled();

    // 3. A esteira segue para o CONTRATO DE TRABALHO (biometria antes, no arranque).
    const dispensar = await screen.findByText('Continuar sem biometria neste aparelho', {}, { timeout: 15_000 });
    fireEvent.click(dispensar);

    await waitFor(() => {
      expect(window.location.hash).toBe(`#${screenToPath[AppScreen.WORK_CONTEXT_SELECTION]}`);
    }, { timeout: 15_000 });

    observer?.disconnect();
    observer = null;
    registarTexto();

    const tudo = textosVistos.join(' ');
    expect(tudo).not.toMatch(/SESS[ÃA]O EXPIRADA/i);
    expect(tudo).not.toMatch(/reautentique/i);
    expect(tudo).not.toMatch(/ACESSAR SISTEMA/);
  }, 40_000);
});
