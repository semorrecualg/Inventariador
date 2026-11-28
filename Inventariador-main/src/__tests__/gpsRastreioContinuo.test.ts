import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * RASTREIO CONTÍNUO — a última posição tem de existir ANTES da conferência
 * ============================================================================
 * O `watchPosition` do rastreio autónomo é registado com
 * `enableHighAccuracy: false` (precisão de rede, para gastar pouca bateria), e
 * num armazém essas leituras ficam entre 60 e 150 m. O filtro anti-jitter, com
 * o limite de COLETA (50 m) que usa por omissão, recusava-as TODAS: a última
 * posição nunca era guardada, cada conferência dependia de uma leitura fria do
 * sensor — que em recinto fechado não fecha dentro dos 10 s nativo / 5 s web —
 * e o ativo era gravado sem `latitude`/`longitude`.
 *
 * E o efeito do rastreio em `App.tsx` estava invertido (`if (!isFieldMode)`):
 * o watch morria exactamente no Modo de Campo, que é quando o auditor está a
 * inventariar. Os dois defeitos juntos explicam «nenhum inventariado com GPS».
 */
const sensor = vi.hoisted(() => ({
  latitude: -16.6869,
  longitude: -49.2648,
  accuracy: 120
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    watchPosition: vi.fn(async (_options: unknown, callback: (position: unknown) => void) => {
      callback({ coords: { ...sensor, altitude: null } });
      return 'watch-de-teste';
    }),
    clearWatch: vi.fn(async () => undefined),
    getCurrentPosition: vi.fn(async () => {
      throw new Error('sem GPS nativo no teste');
    })
  }
}));

import {
  getCurrentLocation,
  persistableAssetGps,
  startAutonomousTracking
} from '../utils/gpsUtils';

beforeAll(() => {
  // O rastreio só arranca com `navigator.geolocation` presente (jsdom não traz).
  Object.defineProperty(navigator, 'geolocation', {
    value: {},
    configurable: true
  });
});

describe('rastreio contínuo', () => {
  it('guarda a leitura de rede (120 m) e ela é a posição gravada no ativo', async () => {
    await startAutonomousTracking();

    const loc = await getCurrentLocation(true);

    expect(persistableAssetGps(loc)).toEqual({
      lat: sensor.latitude,
      lng: sensor.longitude
    });
  });

  it('o efeito do rastreio não depende do Modo de Campo', () => {
    const fonte = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const bloco = fonte.match(/\/\/ Rastreamento Autônomo[\s\S]*?\}, \[[^\]]*\]\);/);

    expect(bloco, 'bloco do rastreio autónomo não encontrado em App.tsx').not.toBeNull();

    // Só o código interessa: o comentário do efeito cita o defeito para o
    // explicar, e não pode ser ele a reprovar o teste.
    const codigo = bloco![0]
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('//'))
      .join('\n');

    expect(codigo).toContain('startAutonomousTracking()');
    // O que não pode voltar é a condição: `if (!isFieldMode) start()` parava o
    // watch exactamente quando o auditor entra em Modo de Campo.
    expect(codigo).not.toMatch(/isFieldMode/);
  });
});
