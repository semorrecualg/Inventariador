// src/__tests__/mergePorCampo.test.ts
// ============================================================================
// ITEM 24b — DOIS AUDITORES NO MESMO ATIVO NÃO SE ATROPELAM
//
// O merge do pull era last-write-wins por APARELHO: com a cópia local pendente,
// `{ ...nuvem, ...local }` entrava inteiro e a conferência feita por outro
// auditor (já na nuvem) desaparecia por causa de uma edição noutro campo.
//
// Aqui prova-se a regra por grupos: a conferência e o ponto de GPS decidem-se
// por TEMPO (com os carimbos que já existem); o resto é trabalho deste aparelho.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { mesclarConflitoPorCampo } from '../utils/mergePorCampo';
import { mergeDeltaPull } from '../utils/mergeDeltaPull';
import type { Asset } from '../types';

const daNuvem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  endereco: 'RUA ANTIGA',
  status: 'PENDENTE',
  _is_deleted: 0,
  updated_at: '2026-11-20T08:00:00Z',
  ...over
});

const doAparelho = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  endereco: 'RUA NOVA',
  status: 'PENDENTE',
  _is_synced: 0,
  _is_deleted: 0,
  _lastUpdated: '2026-11-20T09:00:00Z',
  ...over
});

describe('mesclarConflitoPorCampo — a nuvem e o aparelho no mesmo ativo', () => {
  it('sem pendência local, a linha da nuvem fica inteira', () => {
    const local = doAparelho({ _is_synced: 1 });
    const { registo, exclusaoVenceu, conflitos } = mesclarConflitoPorCampo(daNuvem(), local);

    expect(exclusaoVenceu).toBe(false);
    expect(conflitos).toEqual([]);
    expect(registo.endereco).toBe('RUA ANTIGA');
  });

  it('pendência local sem nada de novo na nuvem: a cópia local vence, como antes', () => {
    const { registo } = mesclarConflitoPorCampo(daNuvem(), doAparelho());

    expect(registo.endereco).toBe('RUA NOVA');
    expect(registo._is_synced).toBe(0);
  });

  it('conferência de outro auditor, mais recente, sobrevive à edição local pendente', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T12:00:00Z',
      status: 'CONFERIDO'
    });
    // Este aparelho está pendente por causa do endereço, não da conferência.
    const local = doAparelho({ _conferido: 0, status: 'PENDENTE' });

    const { registo, conflitos } = mesclarConflitoPorCampo(nuvem, local);

    // Os dois trabalhos coexistem: o endereço é de quem editou, a conferência é
    // de quem conferiu.
    expect(registo.endereco).toBe('RUA NOVA');
    expect(registo._conferido).toBe(true);
    expect(registo._auditor).toBe('auditor.a@gbr.com.br');
    expect(registo._dataLeitura).toBe('2026-11-20T12:00:00Z');
    expect(conflitos).toContain('conferencia');
  });

  it('conferência local mais recente vence a da nuvem', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T10:00:00Z'
    });
    const local = doAparelho({
      _conferido: 1,
      _auditor: 'auditor.b@gbr.com.br',
      _dataLeitura: '2026-11-20T13:00:00Z'
    });

    const { registo } = mesclarConflitoPorCampo(nuvem, local);

    expect(registo._auditor).toBe('auditor.b@gbr.com.br');
    expect(registo._dataLeitura).toBe('2026-11-20T13:00:00Z');
  });

  it('estado pendente do aparelho não é apagado quando a conferência da nuvem vence', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T12:00:00Z',
      status: 'BAIXADO'
    });
    // Este aparelho mudou o estado e ainda não o subiu.
    const local = doAparelho({ _conferido: 0, status: 'EM MANUTENCAO' });

    const { registo } = mesclarConflitoPorCampo(nuvem, local);

    // A conferência é de quem conferiu; o estado é trabalho deste aparelho.
    expect(registo._conferido).toBe(true);
    expect(registo._auditor).toBe('auditor.a@gbr.com.br');
    expect(registo.status).toBe('EM MANUTENCAO');
  });

  it('o status da nuvem volta quando ele próprio é o marcador de conferência', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T12:00:00Z',
      status: 'CONFERIDO'
    });
    const local = doAparelho({ _conferido: 0, status: 'EM MANUTENCAO' });

    const { registo } = mesclarConflitoPorCampo(nuvem, local);

    expect(registo.status).toBe('CONFERIDO');
  });

  it('desmarcar local (sem data de leitura) resiste a uma conferência antiga da nuvem', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-19T10:00:00Z'
    });
    const local = doAparelho({
      _conferido: false,
      _lastUpdated: '2026-11-20T09:00:00Z'
    });

    const { registo } = mesclarConflitoPorCampo(nuvem, local);

    expect(registo._conferido).toBe(false);
  });

  it('o ponto de GPS da nuvem, mais recente, não é regredido', () => {
    const nuvem = daNuvem({
      latitude: -23.5,
      longitude: -46.6,
      _gps_at: '2026-11-20T12:00:00Z'
    });
    const local = doAparelho({
      latitude: -23.4,
      longitude: -46.5,
      _gps_at: '2026-11-20T10:00:00Z'
    });

    const { registo, conflitos } = mesclarConflitoPorCampo(nuvem, local);

    expect(registo.latitude).toBe(-23.5);
    expect(registo.longitude).toBe(-46.6);
    expect(conflitos).toContain('gps');
  });

  it('a leitura de campo mais recente deste aparelho continua a vencer o ponto da nuvem', () => {
    const nuvem = daNuvem({
      latitude: -23.5,
      longitude: -46.6,
      _gps_at: '2026-11-20T08:00:00Z'
    });
    const local = doAparelho({
      latitude: -23.4,
      longitude: -46.5,
      _gps_at: '2026-11-20T11:00:00Z'
    });

    const { registo } = mesclarConflitoPorCampo(nuvem, local);

    expect(registo.latitude).toBe(-23.4);
    expect(registo.gps_lat).toBe(-23.4);
  });

  it('exclusão na nuvem vence o registo inteiro, sem conflitos a reportar', () => {
    const { registo, exclusaoVenceu, conflitos } = mesclarConflitoPorCampo(
      daNuvem({ _is_deleted: 1 }),
      doAparelho()
    );

    expect(exclusaoVenceu).toBe(true);
    expect(conflitos).toEqual([]);
    expect(registo.endereco).toBe('RUA ANTIGA');
  });

  it('sem nada em conflito, a lista de conflitos fica vazia', () => {
    const nuvem = daNuvem({ _conferido: true, _auditor: 'a@x', _dataLeitura: '2026-11-20T10:00:00Z' });
    const local = doAparelho({ _conferido: 1, _auditor: 'a@x', _dataLeitura: '2026-11-20T13:00:00Z' });

    expect(mesclarConflitoPorCampo(nuvem, local).conflitos).toEqual([]);
  });
});

describe('mergeDeltaPull — o delta do dia a dia usa a mesma regra', () => {
  it('mantém a conferência da nuvem e o endereço pendente do aparelho', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T12:00:00Z',
      status: 'CONFERIDO'
    }) as unknown as Asset;
    const local = doAparelho({ _conferido: 0 }) as unknown as Asset;

    const { assets } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: ['PK-1']
    });

    expect(assets[0].endereco).toBe('RUA NOVA');
    expect(assets[0]._auditor).toBe('auditor.a@gbr.com.br');
    expect(assets[0]._conferido).toBe(true);
  });

  it('o delta também não apaga o estado pendente do aparelho', () => {
    const nuvem = daNuvem({
      _conferido: true,
      _auditor: 'auditor.a@gbr.com.br',
      _dataLeitura: '2026-11-20T12:00:00Z',
      status: 'BAIXADO'
    }) as unknown as Asset;
    const local = doAparelho({ _conferido: 0, status: 'EM MANUTENCAO' }) as unknown as Asset;

    const { assets } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: ['PK-1']
    });

    expect(assets[0]._conferido).toBe(true);
    expect(assets[0].status).toBe('EM MANUTENCAO');
  });
});
