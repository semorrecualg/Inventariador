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
    // MARCADOR DOM correto: o HUD exibe currentConfig.lat em texto. O formulário
    // nasce SEM coordenada (Brasília é só centro visual), então o rascunho de
    // sessão é a única fonte de posição: espera o HUD mostrar o rascunho antes de
    // clicar, senão o handleSave recusa gravar ("marque a posição no mapa").
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

  it('nasce SEM coordenada: SALVAR desabilitado e nenhuma âncora gravada', async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
    vi.mocked(saveUnitConfig).mockClear();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      root.render(
        React.createElement(UnitConfigurator, {
          user: ADMIN,
          units: ['010105 CICOPAL PA'],
          onBack: () => {},
          initialUnit: '010105 CICOPAL PA'
        })
      );

      const fixar = await until(() =>
        Array.from(container.querySelectorAll('button')).find((b) =>
          (b.textContent || '').toUpperCase().includes('FIXAR ÂNCORA GPS')
        )
      );
      expect(fixar).toBeTruthy();
      // Unidade sem âncora e sem rascunho: formulário vazio, botão travado.
      expect(fixar!.disabled).toBe(true);
      expect(container.textContent).toContain('AGUARDANDO GPS');

      // Brasília é só o centro visual do mapa: clicar não grava coordenada alguma.
      fixar!.click();
      await new Promise((r) => setTimeout(r, 200));
      expect(vi.mocked(saveUnitConfig)).not.toHaveBeenCalled();
    } finally {
      root.unmount();
      container.remove();
    }
  }, 20000);

  it('BYPASS OFFLINE abre a campanha sem gravar coordenada nenhuma', async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
    vi.mocked(saveUnitConfig).mockClear();

    const unit = '010105 CICOPAL PA';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const applied: string[] = [];
    try {
      root.render(
        React.createElement(UnitConfigurator, {
          user: ADMIN,
          units: [unit],
          onBack: () => {},
          initialUnit: unit,
          onBypassApplied: (u: string) => { applied.push(u); }
        })
      );

      const bypass = await until(() =>
        Array.from(container.querySelectorAll('button')).find((b) =>
          (b.textContent || '').toUpperCase().includes('BYPASS OFFLINE')
        )
      );
      expect(bypass).toBeTruthy();
      bypass!.click();
      await new Promise((r) => setTimeout(r, 200));

      // Nenhuma coordenada em lado nenhum: nem gravação, nem chaves de âncora.
      expect(vi.mocked(saveUnitConfig)).not.toHaveBeenCalled();
      expect(localStorage.getItem(`kardek_gps_ancora_${unit}`)).toBeNull();
      expect(sessionStorage.getItem(`unit_gps_config_${unit}`)).toBeNull();
      expect(sessionStorage.getItem(`gps_lat_${unit}`)).toBeNull();
      expect(sessionStorage.getItem(`gps_lng_${unit}`)).toBeNull();

      // A esteira abre: flags de campanha gravadas e App notificado.
      expect(localStorage.getItem('campaign_bypass_open')).toBe('true');
      expect(sessionStorage.getItem('campaign_bypass_open')).toBe('true');
      expect(localStorage.getItem(`kardek_campaign_open_${unit}`)).toMatch(/^BYPASS_/);
      expect(sessionStorage.getItem('kardek_campaign_open')).toMatch(/^BYPASS_/);
      expect(applied).toEqual([unit]);
      expect(container.textContent).toContain('FALTA ÂNCORA GPS');

      // Nada foi fixado: o botão de âncora não pode dizer "POSIÇÃO FIXADA!".
      expect(container.textContent).not.toContain('POSIÇÃO FIXADA');
      const fixar = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').toUpperCase().includes('FIXAR ÂNCORA GPS')
      );
      expect(fixar).toBeTruthy();
      expect(fixar!.disabled).toBe(true);
    } finally {
      root.unmount();
      container.remove();
    }
  }, 20000);

  it('abre posicionado na âncora da filial gravada só com `filial` (sem unit_id)', async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
    // Registro como vem da nuvem/SQLite antigo: sem `unit_id`, só `filial`.
    const unit = '010105 CICOPAL PA';
    localStorage.setItem('local_unit_configs', JSON.stringify({
      [`CICOPAL_${unit}`]: {
        tenantid: 'CICOPAL',
        filial: unit,
        lat: -16.706719,
        lng: -49.106422,
        radius_meters: 500,
        is_active: true,
        source: 'manual'
      }
    }));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      root.render(
        React.createElement(UnitConfigurator, {
          user: ADMIN,
          units: [unit],
          onBack: () => {},
          initialUnit: unit
        })
      );

      // O HUD só mostra coordenada quando a âncora da filial é aplicada — a tela
      // abria em branco porque a unidade era selecionada antes de as configs
      // chegarem e a procura ignorava registros sem `unit_id`.
      const applied = await until(() =>
        container.textContent?.includes('-16.706719') ? true : undefined
      );
      expect(applied).toBe(true);
      expect(container.textContent).not.toContain('AGUARDANDO GPS');

      const fixar = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').toUpperCase().includes('FIXAR ÂNCORA GPS')
      );
      expect(fixar?.disabled).toBe(false);
    } finally {
      root.unmount();
      container.remove();
    }
  }, 20000);
});
