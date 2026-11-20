// src/__tests__/pullGpsMaisRecente.test.ts
// ============================================================================
// O PULL NÃO REGRIDE A COORDENADA DO APARELHO
//
// O merge do pull remontava a linha do ativo a partir da nuvem e o ponto descia
// com ela: um aparelho que já tinha lido o GPS no campo recebia de volta a
// coordenada antiga que a nuvem ainda guardava (envio anterior, outro aparelho)
// e o mapa de calor voltava ao ponto errado sem ninguém tocar no ativo.
//
// A regra é por TEMPO — a leitura local mais recente vence; a da nuvem vence
// quando é ela a mais recente; sem datas de nenhum dos lados a nuvem fica. A
// nuvem sem ponto não apaga a leitura local (a coluna ausente do upsert também
// já não limpa a coordenada do outro lado).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetGpsPair, preservarGpsMaisRecente } from '../utils/assetGps';

type Registo = Record<string, unknown>;

const PONTO_LOCAL = { latitude: -23.5505, longitude: -46.6333 };
const PONTO_NUVEM = { latitude: -22.9068, longitude: -43.1729 };

/** Linha que desceu da nuvem (vocabulário do app, com as duas grafias). */
const daNuvem = (over: Registo = {}): Registo => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  ...PONTO_NUVEM,
  gps_lat: PONTO_NUVEM.latitude,
  gps_lng: PONTO_NUVEM.longitude,
  ...over,
});

/** Cópia deste aparelho, com a leitura de campo. */
const doAparelho = (over: Registo = {}): Registo => ({
  ...daNuvem(),
  ...PONTO_LOCAL,
  gps_lat: PONTO_LOCAL.latitude,
  gps_lng: PONTO_LOCAL.longitude,
  ...over,
});

/** O merge do pull, como o App o faz. */
const comPull = (nuvem: Registo, local: Registo): Registo => ({
  ...nuvem,
  ...preservarGpsMaisRecente(local, nuvem),
});

describe('pull — a coordenada mais recente vence', () => {
  it('leitura local mais nova do que a da nuvem → fica o ponto local', () => {
    const nuvem = daNuvem({ _dataLeitura: '2026-11-19T08:00:00.000Z' });
    const aparelho = doAparelho({ _dataLeitura: '2026-11-20T09:30:00.000Z' });

    const depois = comPull(nuvem, aparelho);

    expect(assetGpsPair(depois)).toEqual({ lat: PONTO_LOCAL.latitude, lng: PONTO_LOCAL.longitude });
    // As duas grafias acompanham: o envio lê `latitude`, a nuvem lê `gps_lat`.
    expect(depois.gps_lat).toBe(PONTO_LOCAL.latitude);
    expect(depois.gps_lng).toBe(PONTO_LOCAL.longitude);
    // O resto da linha continua a ser a da nuvem.
    expect(depois.etiqueta).toBe('007222');
  });

  it('nuvem mais nova do que a leitura local → fica o ponto da nuvem', () => {
    const nuvem = daNuvem({ _dataLeitura: '2026-11-20T11:00:00.000Z' });
    const aparelho = doAparelho({ _dataLeitura: '2026-11-20T09:30:00.000Z' });

    const depois = comPull(nuvem, aparelho);

    expect(assetGpsPair(depois)).toEqual({ lat: PONTO_NUVEM.latitude, lng: PONTO_NUVEM.longitude });
    expect(preservarGpsMaisRecente(aparelho, nuvem)).toEqual({});
  });

  it('a nuvem sem ponto não apaga a leitura local', () => {
    const nuvem = daNuvem({
      latitude: undefined,
      longitude: undefined,
      gps_lat: undefined,
      gps_lng: undefined
    });

    expect(preservarGpsMaisRecente(doAparelho(), nuvem)).toEqual({
      latitude: PONTO_LOCAL.latitude,
      longitude: PONTO_LOCAL.longitude,
      gps_lat: PONTO_LOCAL.latitude,
      gps_lng: PONTO_LOCAL.longitude
    });
    expect(assetGpsPair(comPull(nuvem, doAparelho()))).toEqual({
      lat: PONTO_LOCAL.latitude,
      lng: PONTO_LOCAL.longitude
    });
  });

  it('sem ponto local válido não há nada a defender — a nuvem fica', () => {
    expect(preservarGpsMaisRecente({ latitude: null, longitude: null }, daNuvem())).toEqual({});
    // Par (0,0) é ausência de leitura, não uma coordenada.
    expect(preservarGpsMaisRecente({ latitude: 0, longitude: 0 }, daNuvem())).toEqual({});
  });

  it('sem data de nenhum dos lados a nuvem fica (não se inventa antiguidade)', () => {
    const nuvem = daNuvem();
    const aparelho = doAparelho();

    expect(preservarGpsMaisRecente(aparelho, nuvem)).toEqual({});
    expect(assetGpsPair(comPull(nuvem, aparelho))).toEqual({
      lat: PONTO_NUVEM.latitude,
      lng: PONTO_NUVEM.longitude
    });
  });

  it('a data do próprio GPS (`_gps_at`) tem prioridade sobre o toque', () => {
    // Toque local recente, mas a leitura do GPS é antiga: a nuvem é a mais nova.
    const aparelho = doAparelho({
      _gps_at: '2026-11-18T10:00:00.000Z',
      _lastUpdated: '2026-11-20T10:00:00.000Z'
    });
    const nuvem = daNuvem({ _dataLeitura: '2026-11-19T08:00:00.000Z' });

    expect(preservarGpsMaisRecente(aparelho, nuvem)).toEqual({});
  });

  it('a linha da nuvem como data (`updated_at`) também serve de referência', () => {
    const nuvem = daNuvem({ updated_at: '2026-11-20T12:00:00.000Z' });
    const aparelho = doAparelho({ _lastUpdated: '2026-11-20T11:00:00.000Z' });

    expect(preservarGpsMaisRecente(aparelho, nuvem)).toEqual({});
  });
});

describe('pull — a regra do GPS vive num só sítio', () => {
  const fonteApp = (): string => readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it('o merge completo e o delta passam a linha local à regra', () => {
    const fonte = fonteApp();

    // A regra é chamada uma vez em cada caminho e o resultado é espalhado na
    // linha da nuvem (o item 15 guarda-o em `gpsDaqui` para saber se a linha
    // precisa de voltar ao disco; o efeito é o mesmo).
    expect(fonte).toContain('preservarGpsMaisRecente(local, cloudAsset)');
    expect(fonte).toContain('{ ...cloudAsset, ...gpsDaqui }');
    expect(fonte).toContain('preservarGpsMaisRecente(local, a)');
    expect(fonte).toContain('{ ...a, ...gpsDaqui }');
    // Nenhuma segunda regra de GPS dentro do App.
    expect(fonte).not.toContain('latitude >');
  });

  it('a decisão por tempo está em utils/assetGps e compara as datas', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'utils', 'assetGps.ts'), 'utf8');

    expect(fonte).toContain('export const preservarGpsMaisRecente');
    expect(fonte).toContain('row._gps_at');
    expect(fonte).toContain('row._lastUpdated');
    expect(fonte).toContain('tNuvem >= tLocal');
  });
});
