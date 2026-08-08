// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import UnitConfigurator from '../components/UnitConfigurator';
import type { User } from '../types';

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

    const user = { tenantid: 'CICOPAL', email: 'auditor@gbr.com', role: 'ADMIN' } as unknown as User;

    let caught: unknown = null;
    try {
      root.render(
        React.createElement(UnitConfigurator, {
          user,
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
});
