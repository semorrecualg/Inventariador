// src/__tests__/conflitoSubida.test.ts
// ============================================================================
// CONFLITO POR CAMPO NA SUBIDA (H1 · Fase 2)
//
// A descida já decidia a conferência e o ponto por tempo (`mergePorCampo`). O
// envio não: montava o payload inteiro e o `ON CONFLICT DO UPDATE` gravava
// tudo, por isso um aparelho com a fila parada apagava a conferência que outro
// auditor fez depois. Aqui fixa-se a regra do outro sentido: a nuvem só vence
// com uma `data_leitura` estritamente posterior, e nesse caso os campos do
// grupo não sobem e o registo local adota os da nuvem.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { resolverConflitoDeSubida } from '../utils/conflitoSubida';

/** O registo deste aparelho, com conferência e ponto pendentes de envio. */
const doAparelho = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: '01010100000005000001',
  primarykey: '01010100000005000001',
  tenantid: 'CICOPAL',
  status: 'CONFERIDO',
  _conferido: 1,
  _is_synced: 0,
  _auditor: 'semorr@gmail.com',
  _dataLeitura: '2026-11-19T09:00:00.000Z',
  latitude: -16.0,
  longitude: -48.0,
  ...over,
});

/** A linha CRUA da nuvem, como sai de `fetchCloudConflictRows`. */
const daNuvem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  tenantid: 'CICOPAL',
  primarykey: '01010100000005000001',
  conferido: true,
  auditor: 'outro.auditor@gbr.com.br',
  data_leitura: '2026-11-20T10:00:00.000Z',
  status: 'CONFERIDO',
  gps_lat: -15.7942,
  gps_lng: -47.8825,
  ...over,
});

describe('conferência — a leitura mais recente é a que fica', () => {
  it('a nuvem com leitura posterior ganha: os campos não sobem e são adotados', () => {
    const { conferencia, conflitos } = resolverConflitoDeSubida(doAparelho(), daNuvem());

    expect(conferencia.enviar).toBe(false);
    expect(conferencia.adotar).toEqual({
      _conferido: true,
      _dataLeitura: '2026-11-20T10:00:00.000Z',
      _auditor: 'outro.auditor@gbr.com.br',
      status: 'CONFERIDO',
    });
    // Autor diferente com leitura dos dois lados: vai para a trilha.
    expect(conflitos).toContain('conferencia');
  });

  it('a nuvem sem `data_leitura` não ganha por omissão', () => {
    const { conferencia } = resolverConflitoDeSubida(
      doAparelho(),
      daNuvem({ data_leitura: null })
    );

    expect(conferencia.enviar).toBe(true);
    expect(conferencia.adotar).toEqual({});
  });

  it('a leitura deste aparelho mais recente continua a subir', () => {
    const { conferencia } = resolverConflitoDeSubida(
      doAparelho({ _dataLeitura: '2026-11-21T08:00:00.000Z' }),
      daNuvem()
    );

    expect(conferencia.enviar).toBe(true);
    expect(conferencia.adotar).toEqual({});
  });

  it('o desmarcar local usa o toque como prova de tempo', () => {
    const aparelho = doAparelho({
      status: 'PENDENTE',
      _conferido: 0,
      _dataLeitura: undefined,
      _lastUpdated: '2026-11-21T07:00:00.000Z',
    });

    const { conferencia, conflitos } = resolverConflitoDeSubida(aparelho, daNuvem());

    expect(conferencia.enviar).toBe(true);
    expect(conflitos).toContain('conferencia');
  });

  it('sem data de nenhum dos lados o comportamento é o de sempre: sobe', () => {
    const aparelho = doAparelho({ _dataLeitura: undefined, _lastUpdated: undefined });
    const nuvem = daNuvem({ data_leitura: null, conferido: false, status: 'PENDENTE' });

    const { conferencia, conflitos } = resolverConflitoDeSubida(aparelho, nuvem);

    expect(conferencia.enviar).toBe(true);
    // Esta parte é diagnóstica: os dois lados discordam da conferência.
    expect(conflitos).toContain('conferencia');
  });

  it('sem linha remota não há conflito nenhum', () => {
    const { conferencia, gps, conflitos } = resolverConflitoDeSubida(doAparelho(), undefined);

    expect(conferencia).toEqual({ enviar: true, adotar: {} });
    expect(gps).toEqual({ enviar: true, adotar: {} });
    expect(conflitos).toEqual([]);
  });
});

describe('ponto de GPS — o mesmo critério de tempo', () => {
  it('o ponto da nuvem mais recente não é apagado pelo do aparelho', () => {
    const { gps, conflitos } = resolverConflitoDeSubida(doAparelho(), daNuvem());

    expect(gps.enviar).toBe(false);
    expect(gps.adotar).toEqual({
      latitude: -15.7942,
      longitude: -47.8825,
      gps_lat: -15.7942,
      gps_lng: -47.8825,
    });
    expect(conflitos).toContain('gps');
  });

  it('o ponto da nuvem sem leitura datada não ganha', () => {
    const { gps } = resolverConflitoDeSubida(
      doAparelho(),
      daNuvem({ data_leitura: null })
    );

    expect(gps.enviar).toBe(true);
    expect(gps.adotar).toEqual({});
  });

  it('o ponto deste aparelho mais recente sobe', () => {
    const { gps, conflitos } = resolverConflitoDeSubida(
      doAparelho({ _gps_at: '2026-11-22T06:00:00.000Z' }),
      daNuvem()
    );

    expect(gps.enviar).toBe(true);
    expect(conflitos).toContain('gps');
  });

  it('a nuvem sem par válido não faz perder a leitura local', () => {
    const { gps } = resolverConflitoDeSubida(
      doAparelho(),
      daNuvem({ gps_lat: null, gps_lng: null })
    );

    expect(gps.enviar).toBe(true);
    expect(gps.adotar).toEqual({});
  });

  it('pontos iguais não contam como conflito', () => {
    const { gps, conflitos } = resolverConflitoDeSubida(
      doAparelho({ latitude: -15.7942, longitude: -47.8825 }),
      daNuvem()
    );

    // O tempo da nuvem é mais recente, mas nada muda no ponto.
    expect(gps.enviar).toBe(false);
    expect(conflitos).not.toContain('gps');
  });
});
