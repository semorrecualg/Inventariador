import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AppScreen } from '../types';

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
 *
 * O rastreio também não pode ficar ligado o dia inteiro: corre só nos ecrãs em
 * que se confere, e é `deveRastrearGpsContinuo` quem decide.
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
  deveRastrearGpsContinuo,
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

  it('liga o rastreio nos ecrãs em que se confere', () => {
    for (const ecra of [
      AppScreen.INVENTORY,
      AppScreen.ASSET_DETAIL,
      AppScreen.LABELING,
      AppScreen.ACCOUNT_RECONCILIATION
    ]) {
      expect(deveRastrearGpsContinuo(ecra), ecra).toBe(true);
    }
  });

  it('não deixa o rastreio ligado o dia inteiro', () => {
    for (const ecra of [
      AppScreen.MAIN_MENU,
      AppScreen.DASHBOARD,
      AppScreen.DATABASE_MANAGER,
      AppScreen.ASSET_MAP,
      AppScreen.LOGIN
    ]) {
      expect(deveRastrearGpsContinuo(ecra), ecra).toBe(false);
    }
    expect(deveRastrearGpsContinuo(null)).toBe(false);
    expect(deveRastrearGpsContinuo(undefined)).toBe(false);
  });
});
