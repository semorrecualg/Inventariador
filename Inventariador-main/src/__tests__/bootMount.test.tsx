// @vitest-environment jsdom
// ============================================================================
// bootMount.test.tsx — o arranque real, com o App montado.
//
// O separador novo chega ao App com `sessionStorage` vazio e só a cópia em
// `localStorage`; o `InitializeBootPipeline` corre DEPOIS da primeira
// renderização. Este teste garante que:
//   1. a primeira decisão de ecrã concorda com a sessão reposta;
//   2. o login não chega a ser desenhado — nem por um instante;
//   3. o destino não depende de ser o dono nem da base local (o `/unit`
//      intermitente vinha da blindagem de base vazia a apanhar o percurso de
//      entrada; ver `bootRedirects.test.ts`).
// ============================================================================
import 'fake-indexeddb/auto'; // Dexie precisa do IndexedDB antes do App montar
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { writePersistedSession, PERSISTED_SESSION_KEY } from '../utils/sessionPersistence';
import { screenToPath } from '../router/routes';
import { AppScreen } from '../types';
import type { User } from '../types';

// O dono global (ADMIN_EMAIL de `.env.test`) e um admin que NÃO é o dono — era
// este último que, com base vazia, acabava em `/unit` num ambiente de teste.
const DONO = {
  email: 'admin@example.com',
  username: 'admin',
  name: 'Dono Global',
  role: 'ADMIN',
  tenantid: 'CICOPAL',
  filial: 'TODAS'
} as User;

const ADMIN_NAO_DONO = {
  ...DONO,
  email: 'gestor@cliente.com',
  username: 'gestor',
  name: 'Gestor do Contrato'
} as User;

// O cliente Supabase abre realtime assim que é criado (no import do App); em
// jsdom a ligação real estoura no undici. O stub tem de existir ANTES dos
// imports, por isso vive num `vi.hoisted`.
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

let textosVistos: string[] = [];
let historicoEscrito: string[] = [];
let observer: MutationObserver | null = null;
let setItemSpy: ReturnType<typeof vi.spyOn> | null = null;

const registarTexto = () => {
  textosVistos.push((document.body.textContent || '').replace(/\s+/g, ' '));
};

beforeEach(() => {
  // O App continua a registar depois do unmount e o worker do Vitest morre a
  // meio desse log (EnvironmentTeardownError). Silencia só o ruído informativo.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  localStorage.clear();
  sessionStorage.clear();
  textosVistos = [];
  historicoEscrito = [];
  window.location.hash = '';

  // Toda a escrita do histórico, para provar por onde o arranque passou.
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

afterEach(() => {
  observer?.disconnect();
  observer = null;
  setItemSpy?.mockRestore();
  setItemSpy = null;
  vi.restoreAllMocks();
  cleanup();
});

describe('Arranque com cópia persistida', () => {
  it.each([
    ['dono global', DONO],
    ['admin que não é o dono', ADMIN_NAO_DONO]
  ])('%s monta já em CONTRATO, restaura a mesma sessão e nunca passa pelo login nem pela unidade', async (_nome, perfil) => {
    // Separador novo: só a cópia com prazo em localStorage.
    writePersistedSession(perfil, Date.now());
    expect(sessionStorage.getItem('app_current_user')).toBeNull();

    observer = new MutationObserver(registarTexto);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    render(React.createElement(MemoryRouter, null, React.createElement(App)));
    registarTexto();

    // 1. Primeira decisão: o ecrã inicial é o CONTRATO e a sessão é a reposta.
    expect(window.location.hash).toBe(`#${screenToPath[AppScreen.WORK_CONTEXT_SELECTION]}`);
    const sessaoInicial = JSON.parse(sessionStorage.getItem('app_current_user') || '{}') as User;
    expect(sessaoInicial.email).toBe(perfil.email);
    expect(sessaoInicial.tenantid).toBe(perfil.tenantid);
    expect(sessionStorage.getItem('gbr_session_origin')).toBe('APP');

    // O pipeline e os efeitos de boot correm depois; nada pode desviar.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    registarTexto();
    observer.disconnect();
    observer = null;

    expect(window.location.hash).toBe(`#${screenToPath[AppScreen.WORK_CONTEXT_SELECTION]}`);
    expect(sessionStorage.getItem('app_current_user')).not.toBeNull();
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).not.toBeNull();

    // 2. Nenhuma escrita do histórico ancorou no login nem na unidade.
    expect(historicoEscrito.length).toBeGreaterThan(0);
    const pilhas = historicoEscrito.map((valor) => JSON.parse(valor) as AppScreen[]);
    const destinos = pilhas.map((pilha) => pilha[pilha.length - 1]);
    expect(destinos).not.toContain(AppScreen.LOGIN);
    expect(destinos).not.toContain(AppScreen.UNIT_SELECTION);
    expect(pilhas.map((pilha) => pilha[0])).not.toContain(AppScreen.LOGIN);
    expect(pilhas.map((pilha) => pilha[0])).not.toContain(AppScreen.UNIT_SELECTION);

    // 3. E o ecrã de entrada nunca chegou a ser desenhado.
    expect(textosVistos.some((texto) => texto.includes('ACESSAR SISTEMA'))).toBe(false);
  }, 20_000);

  it('sem cópia nenhuma, o login é o ecrã inicial (controlo)', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(App)));

    expect(window.location.hash).toBe('#/login');
    expect(JSON.parse(localStorage.getItem('gbr_kardek_history') || '[]')).toEqual([AppScreen.LOGIN]);
  }, 20_000);
});
