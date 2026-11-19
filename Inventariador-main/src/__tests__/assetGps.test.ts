// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { assetGpsPair } from '../utils/assetGps';
import { mapCloudAssetRow } from '../services/supabaseService';
import { db, sqliteService } from '../services/sqliteService';

const KEY = '001288';
const TENANT = 'CICOPAL';

const baseRow = (extra: Record<string, unknown> = {}) => ({
  id: KEY,
  primarykey: KEY,
  tenantid: TENANT,
  filial: '010101 CICOPAL GO',
  status: 'CONFERIDO',
  etiqueta: 'ETQ-1',
  qt: 1,
  descricaodoativo: 'ATIVO',
  ...extra
});

describe('assetGpsPair — ponte latitude/longitude ↔ gps_lat/gps_lng', () => {
  it('usa a grafia canónica do app quando existe', () => {
    expect(
      assetGpsPair({ latitude: -15.7942, longitude: -47.8825, gps_lat: -16.68, gps_lng: -49.25 })
    ).toEqual({ lat: -15.7942, lng: -47.8825 });
  });

  it('cai para a coluna da nuvem quando só ela tem leitura', () => {
    expect(assetGpsPair({ latitude: null, longitude: null, gps_lat: -16.68, gps_lng: -49.25 }))
      .toEqual({ lat: -16.68, lng: -49.25 });
  });

  it('recusa ausência de leitura, o par (0,0) e valores fora da faixa', () => {
    expect(assetGpsPair(null)).toBeNull();
    expect(assetGpsPair(undefined)).toBeNull();
    expect(assetGpsPair({})).toBeNull();
    expect(assetGpsPair({ latitude: 0, longitude: 0 })).toBeNull();
    expect(assetGpsPair({ latitude: 91, longitude: -49.25 })).toBeNull();
    expect(assetGpsPair({ latitude: -16.68, longitude: 181 })).toBeNull();
    expect(assetGpsPair({ latitude: Number.NaN, longitude: -47.88 })).toBeNull();
  });

  it('não transforma latitude ausente em 0 (Equador)', () => {
    expect(assetGpsPair({ latitude: null, longitude: -49.25 })).toBeNull();
    expect(assetGpsPair({ latitude: '', longitude: '-49.25' })).toBeNull();
  });

  it('aceita numéricos em texto, como o PostgREST devolve as colunas numeric', () => {
    expect(assetGpsPair({ gps_lat: '-16.680000', gps_lng: '-49.250000' }))
      .toEqual({ lat: -16.68, lng: -49.25 });
  });
});

describe('mapCloudAssetRow — o GPS da nuvem chega à ficha e ao mapa', () => {
  it('converte gps_lat/gps_lng em latitude/longitude', () => {
    const asset = mapCloudAssetRow({
      id: KEY,
      tenantid: 'cicopal',
      filial: '010101 cicopal go',
      gps_lat: -16.68,
      gps_lng: -49.25
    });

    expect(asset.latitude).toBeCloseTo(-16.68);
    expect(asset.longitude).toBeCloseTo(-49.25);
    expect(asset.gps_lat).toBeCloseTo(-16.68);
  });

  it('sem coordenada na linha não inventa posição', () => {
    const asset = mapCloudAssetRow({ id: KEY, tenantid: 'cicopal', gps_lat: null, gps_lng: null });
    expect(asset.latitude).toBeUndefined();
    expect(asset.longitude).toBeUndefined();
  });
});

describe('gravação local — a carga da base não perde a coordenada', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
  });

  it('persiste latitude/longitude a partir de gps_lat/gps_lng do pull', async () => {
    const asset = mapCloudAssetRow(baseRow({ gps_lat: -16.68, gps_lng: -49.25 }));
    await sqliteService.bulkInsertAssetsOfflineFirst([
      asset as unknown as Record<string, unknown>
    ]);

    const row = await db.local_assets.get([TENANT, KEY]);
    expect(row?.latitude).toBeCloseTo(-16.68);
    expect(row?.longitude).toBeCloseTo(-49.25);
    expect(row?.gps_lat).toBeCloseTo(-16.68);
  });

  it('guarda também em gps_lat/gps_lng a coordenada que a conferência gravou em latitude', async () => {
    await sqliteService.bulkInsertAssetsOfflineFirst([
      baseRow({ latitude: -15.7942, longitude: -47.8825 })
    ]);

    const row = await db.local_assets.get([TENANT, KEY]);
    expect(row?.latitude).toBeCloseTo(-15.7942);
    expect(row?.gps_lat).toBeCloseTo(-15.7942);
    expect(row?.gps_lng).toBeCloseTo(-47.8825);
  });
});
