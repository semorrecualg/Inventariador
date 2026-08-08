// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import UnitConfigurator from '../components/UnitConfigurator';
import { Geolocation } from '@capacitor/geolocation';
import type { User, UnitConfig } from '../types';

const ADMIN: User = { tenantid: 'CICOPAL', email: 'admin@gbr.com', role: 'ADMIN' } as unknown as User;

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
      // eslint-disable-next-line no-console
      console.error('>>> REPRO CRASH:', (caught as Error).stack);
    }
    expect(caught).toBeNull();
  });

  it('notifica onUpdateConfigs com a lista JÁ atualizada após FIXAR ÂNCORA GPS', async () => {
    // Isola do teste anterior
    localStorage.clear();
    sessionStorage.clear();

    // Modo INTERNAL → saveUnitConfig retorna true sem tocar a nuvem
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

    // Espera o load assíncrono de configs + seed do currentConfig
    await new Promise((r) => setTimeout(r, 400));

    const buttons = Array.from(container.querySelectorAll('button'));
    const fixar = buttons.find((b) => (b.textContent || '').toUpperCase().includes('FIXAR ÂNCORA GPS'));
    expect(fixar).toBeTruthy();
    fixar!.click();

    // Espera o fluxo assíncrono do handleSave (geolocalização + persistência local)
    await new Promise((r) => setTimeout(r, 1200));

    expect(received.length).toBeGreaterThan(0);
    const saved = received.find((c) => c.unit_id === '010101 CICOPAL GO');
    expect(saved).toBeTruthy();
    expect(Number(saved?.lat)).not.toBe(0);
    expect(Number(saved?.lng)).not.toBe(0);
    expect(Number(saved?.lat)).toBeCloseTo(-16.706719, 3);
  });
});
