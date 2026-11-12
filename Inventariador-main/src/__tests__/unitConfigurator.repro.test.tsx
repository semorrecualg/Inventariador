// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import UnitConfigurator from '../components/UnitConfigurator';
import { Geolocation } from '@capacitor/geolocation';
import { saveUnitConfig } from '../services/supabaseService';
import type { User, UnitConfig } from '../types';

/**
 * A gravação real (saveUnitConfig) faz upsert no Supabase e importa o SQLite.
 * Num runner sem credenciais o client cai no URL placeholder e as requisições
 * ficam pendentes; o `await` dentro de handleSave segurava a notificação ao pai
 * e o teste falhava com a lista vazia. O alvo deste teste é o componente
 * (onUpdateConfigs já deve receber a âncora recém-gravada), não a nuvem: aqui a
 * persistência é stub e o resto do módulo continua real.
 */
vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>();
  return {
    ...actual,
    saveUnitConfig: vi.fn(async () => true),
    saveUnitConfigFlags: vi.fn(async () => true),
  };
});

const ADMIN: User = { tenantid: 'CICOPAL', email: 'admin@gbr.com', role: 'ADMIN' } as unknown as User;

/**
 * Aguarda até a sonda devolver um valor ou expirar o tempo total.
 * Substitui sleeps fixos: runners lentos (CI 2 vCPU) derrubavam o teste que
 * dava 1200ms exatos ao fluxo assíncrono do handleSave.
 */
async function until<T>(probe: () => T | undefined, timeoutMs = 6000, stepMs = 50): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  while (Date.now() - start < timeoutMs) {
    last = probe();
    if (last !== undefined) return last;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return probe() as T;
}

describe('UnitConfigurator mount repro (reading lng)', () => {
  it('mounts without throwing when a unit with invalid stored coords is selected', async () => {
    // Seeds mimic stale drafts/anchor records that could break the map pipeline
    sessionStorage.setItem('kardek_temp_gps_lat_010101 CICOPAL GO', 'null');
    sessionStorage.setItem('kardek_temp_gps_lng_010101 CICOPAL GO', 'null');
    localStorage.setItem('kardek_gps_ancora_010101 CICOPAL GO', JSON.stringify({ filial: '010101 CICOPAL GO', lat: null, lng: null }));
    localStorage.setItem('unit_config_map_type', 'street');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let caught: unknown = null;
    try {
      root.render(
        React.createElement(UnitConfigurator, {
          user: ADMIN,
          units: ['010101 CICOPAL GO'],
          onBack: () => {},
          initialUnit: '010101 CICOPAL GO'
        })
      );
      // Let effects (map init, load configs, select unit) flush
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      caught = e;
    }

    if (caught) {
      console.error('>>> REPRO CRASH:', (caught as Error).stack);
    }
    expect(caught).toBeNull();

    // Limpeza: desmonta a instância — dois roots montados compartilham DOM,
    // sessionStorage e o Dexie do worker; o próximo teste não pode herdar isso.
    root.unmount();
    container.remove();
  });

  it('notifica onUpdateConfigs com a lista JÁ atualizada após FIXAR ÂNCORA GPS', async () => {
    // Isola do teste anterior
    localStorage.clear();
    sessionStorage.clear();

    // Modo INTERNAL (o stub de saveUnitConfig garante que nada toca a rede)
    localStorage.setItem('app_database_mode', 'INTERNAL');
    // Rascunhos preventivos → o efeito semeia currentConfig com coordenadas reais
    sessionStorage.setItem('kardek_temp_gps_lat_010101 CICOPAL GO', '-16.706719');
    sessionStorage.setItem('kardek_temp_gps_lng_010101 CICOPAL GO', '-49.106422');
    sessionStorage.setItem('kardek_temp_gps_radius_010101 CICOPAL GO', '500');

    // Hardware GPS indisponível no desktop/jsdom → cai no fallback simulado (sem travar)
    Geolocation.getCurrentPosition = () => Promise.reject(new Error('PERMISSION_DENIED'));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let received: UnitConfig[] = [];
    const onUpdateConfigs = (configs: UnitConfig[]) => {
      received = configs;
    };

    root.render(
      React.createElement(UnitConfigurator, {
        user: ADMIN,
        units: ['010101 CICOPAL GO'],
        onBack: () => {},
        initialUnit: '010101 CICOPAL GO',
        onUpdateConfigs
      })
    );

    // Espera o load assíncrono de configs + seed do currentConfig — polling com o
    // MARCADOR DOM correto: o HUD exibe currentConfig.lat em texto. O estado inicial
    // do componente já nasce com Brasília (-15.794200), então esperar só o botão não
    // garante o seed: clicando cedo, o handleSave grava Brasília e descarta os rascunhos.
    const fixar = await until(() =>
      container.textContent?.includes('-16.706719')
        ? Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').toUpperCase().includes('FIXAR ÂNCORA GPS'),
          )
        : undefined,
    );
    expect(fixar).toBeTruthy();
    fixar!.click();

    // Espera o fluxo assíncrono do handleSave (geolocalização + persistência local).
    // 10s: dá folga ao runner lento sem mascarar espera infinita.
    await until(() => (received.length > 0 ? true : undefined), 10000);

    // Diagnóstico legível no resumo do CI: se falhar, diz em que ponto parou e o
    // que o componente mostrou na tela (ex.: 'SELECIONE UMA UNIDADE', 'BLOQUEADO').
    const tela = (container.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    expect(
      vi.mocked(saveUnitConfig),
      `handleSave parou antes de gravar — tela: ${tela}`,
    ).toHaveBeenCalled();
    expect(received.length, `onUpdateConfigs não foi notificado — tela: ${tela}`).toBeGreaterThan(0);
    const saved = received.find((c) => c.unit_id === '010101 CICOPAL GO');
    expect(saved).toBeTruthy();
    expect(Number(saved?.lat)).not.toBe(0);
    expect(Number(saved?.lng)).not.toBe(0);
    expect(Number(saved?.lat)).toBeCloseTo(-16.706719, 3);

    // Limpeza final: sem raízes órfãs afetando o restante da suíte
    root.unmount();
    container.remove();
    // Limite explícito: os dois `until(...)` acima podem esperar até 6 s cada,
    // então o padrão de 5 s do Vitest matava o teste num runner lento (CI) antes
    // de o helper desistir. O teste não trava — ele só precisa de mais folga.
  }, 20000);
});
