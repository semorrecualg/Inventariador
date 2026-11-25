// @vitest-environment jsdom
// src/__tests__/mapaSemPontoFalso.test.ts
// ============================================================================
// NENHUM ATIVO EM (0,0) NEM COM PONTO SINTÉTICO NO MAPA DE CALOR
//
// O mapa filtrava só por `isValidCoordinate`. Isso já barrava o par (0,0) e as
// coordenadas fora de faixa, mas deixava entrar no heatmap:
//   - `_gps_source = 'synthetic'` (âncora/admin/sandbox) — coordenada de
//     contingência, nunca lida pelo sensor;
//   - precisão acima de `GPS_ACCURACY.DISCARD` (150 m) — ruído de rede/célula.
// E lia apenas `latitude`/`longitude`: um ativo com o ponto só em
// `gps_lat`/`gps_lng` (grafia da nuvem) desaparecia do mapa.
//
// A regra vive em `utils/assetGps.mapPointOf`/`hasMapCoords` e é a mesma em
// todos os caminhos do mapa de calor (pontos, grid, área/perímetro, centro e
// contador).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasMapCoords, mapPointOf } from '../utils/assetGps';

const CURITIBA = { latitude: -25.4284, longitude: -49.2733 };

const ativo = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  ...over,
});

describe('mapa de calor — o que pode virar ponto', () => {
  it('ativo sem GPS não entra', () => {
    expect(mapPointOf(ativo())).toBeNull();
    expect(hasMapCoords(ativo())).toBe(false);
    expect(hasMapCoords(ativo({ latitude: null, longitude: null }))).toBe(false);
    expect(hasMapCoords(ativo({ latitude: undefined, longitude: undefined }))).toBe(false);
  });

  it('o par (0,0) não entra (null disfarçado de sensor sem fix)', () => {
    expect(mapPointOf(ativo({ latitude: 0, longitude: 0 }))).toBeNull();
    expect(hasMapCoords(ativo({ latitude: '0', longitude: '0' }))).toBe(false);
    expect(hasMapCoords(ativo({ gps_lat: 0, gps_lng: 0 }))).toBe(false);
  });

  it('coordenada fora de faixa não entra', () => {
    expect(hasMapCoords(ativo({ latitude: 500, longitude: 999 }))).toBe(false);
    expect(hasMapCoords(ativo({ latitude: -123, longitude: -49 }))).toBe(false);
  });

  it('ponto sintético nunca entra, mesmo com coordenada válida', () => {
    expect(mapPointOf(ativo({ ...CURITIBA, _gps_source: 'synthetic' }))).toBeNull();
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_source: ' Synthetic ' }))).toBe(false);
    // Mas o ponto real do sensor entra.
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_source: 'sensor' }))).toBe(true);
  });

  it('precisão acima de 150 m é ruído e não entra', () => {
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: 200 }))).toBe(false);
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: '151' }))).toBe(false);
    // O limite em si é aceite (`> DISCARD` é que descarta).
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: 150 }))).toBe(true);
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: 18 }))).toBe(true);
  });

  it('registo legado (sem proveniência nem precisão) entra se o par for válido', () => {
    expect(mapPointOf(ativo(CURITIBA))).toEqual({ lat: CURITIBA.latitude, lng: CURITIBA.longitude });
    // Precisão declarada como 0/inválida não é prova de ruído: não se descarta.
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: 0 }))).toBe(true);
    expect(hasMapCoords(ativo({ ...CURITIBA, _gps_accuracy: 'n/d' }))).toBe(true);
  });

  it('o ponto na grafia da nuvem (`gps_lat`/`gps_lng`) também entra', () => {
    expect(mapPointOf(ativo({ gps_lat: -25.43, gps_lng: -49.27 }))).toEqual({ lat: -25.43, lng: -49.27 });
    // `latitude`/`longitude` continuam a ser a grafia preferida.
    expect(mapPointOf(ativo({ ...CURITIBA, gps_lat: -22.9, gps_lng: -43.2 }))).toEqual({
      lat: CURITIBA.latitude,
      lng: CURITIBA.longitude,
    });
  });
});

describe('mapa de calor — a regra é uma só em todo o ecrã', () => {
  const fonteMapa = (): string =>
    readFileSync(join(process.cwd(), 'src', 'components', 'AssetMap.tsx'), 'utf8');

  it('pontos, grid, área, centro e contador usam a regra única', () => {
    const fonte = fonteMapa();

    expect(fonte).not.toContain('hasValidCoords');
    expect(fonte).toContain('filteredAssets.filter(hasMapCoords)');
    expect(fonte).toContain('sourceAssets\n      .filter(hasMapCoords)');
    // Coordenadas lidas pela ponte única (as duas grafias), não à mão.
    expect(fonte).toContain('mapPointOf(a)');
    expect(fonte).not.toContain('asFiniteCoord(a.latitude)');
  });

  it('a decisão vive em utils/assetGps e olha para a proveniência e a precisão', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'utils', 'assetGps.ts'), 'utf8');

    expect(fonte).toContain('export const mapPointOf');
    expect(fonte).toContain('export const hasMapCoords');
    expect(fonte).toContain("=== 'synthetic'");
    expect(fonte).toContain('GPS_ACCURACY.DISCARD');
  });
});

describe('mapa de calor — a proveniência sobrevive ao lote', () => {
  it('o mapeamento do lote grava `_gps_source`/`_gps_accuracy`/`_gps_at`', async () => {
    const { db, sqliteService } = await import('../services/sqliteService');
    await db.local_assets.clear();
    await db.ativos.clear();

    await sqliteService.bulkInsertAssetsOfflineFirst([
      {
        ...ativo(CURITIBA),
        _gps_source: 'sensor',
        _gps_accuracy: 12,
        _gps_at: '2026-11-20T10:00:00.000Z',
      },
    ]);

    const linha = await db.local_assets.where('primarykey').equals('PK-1').first();
    expect(linha?._gps_source).toBe('sensor');
    expect(Number(linha?._gps_accuracy)).toBe(12);
    expect(linha?._gps_at).toBe('2026-11-20T10:00:00.000Z');
    expect(hasMapCoords(linha)).toBe(true);

    // Um ponto sintético gravado no lote continua fora do mapa.
    await sqliteService.bulkInsertAssetsOfflineFirst([
      { ...ativo(CURITIBA), _gps_source: 'synthetic' },
    ]);
    const sintetico = await db.local_assets.where('primarykey').equals('PK-1').first();
    expect(hasMapCoords(sintetico)).toBe(false);
  });
});
