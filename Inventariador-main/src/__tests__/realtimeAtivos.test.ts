import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  ativoTemPendencia,
  avancarCheckpoint,
  idsComPendencia,
  linhasQueMudaram,
  mesclarEventoDeAtivo
} from '../utils/realtimeAtivos';

/**
 * H1 · Fase 4 — o evento de tempo real deixa de descartar o ativo pendente.
 *
 * O caso que interessa é o de dois auditores no mesmo ativo: um confere às
 * 10:00 (nuvem), o outro edita o endereço neste aparelho às 09:00 e ainda não
 * subiu. O evento da nuvem tem de trazer a conferência mais recente SEM apagar
 * o endereço que este aparelho escreveu.
 */
const localPendente = (over: Record<string, unknown> = {}) =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'PENDENTE',
    descricaodoativo: 'EDITADO AQUI',
    endereco: 'RUA LOCAL, 10',
    _conferido: 1,
    _auditor: 'ANA',
    _dataLeitura: '2026-11-20T09:00:00.000Z',
    latitude: -16.6,
    longitude: -49.2,
    gps_lat: -16.6,
    gps_lng: -49.2,
    _is_synced: 0,
    _lastUpdated: '2026-11-20T09:05:00.000Z',
    ...over
  }) as unknown as Asset;

const daNuvem = (over: Record<string, unknown> = {}) =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    descricaodoativo: 'NA NUVEM',
    endereco: 'RUA DA NUVEM, 99',
    _conferido: 1,
    _auditor: 'BRUNO',
    _dataLeitura: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-20T10:01:00.000Z',
    ...over
  }) as unknown as Asset;

describe('ativoTemPendencia — as duas provas da pendência local', () => {
  it('a flag persistida marca pendência', () => {
    expect(ativoTemPendencia({ _is_synced: 0 })).toBe(true);
  });

  it('o toque da sessão marca pendência mesmo sem a flag', () => {
    expect(ativoTemPendencia({ _is_synced: 1 }, true)).toBe(true);
  });

  it('sem flag nem toque não há pendência', () => {
    expect(ativoTemPendencia({ _is_synced: 1 }, false)).toBe(false);
    expect(ativoTemPendencia({})).toBe(false);
    expect(ativoTemPendencia(null)).toBe(false);
  });
});

describe('mesclarEventoDeAtivo — o conflito resolve-se no próprio evento', () => {
  it('ativo desconhecido entra como veio da nuvem', () => {
    const nuvem = daNuvem();
    const decisao = mesclarEventoDeAtivo(undefined, nuvem, false);

    expect(decisao.registo).toBe(nuvem);
    expect(decisao.alterou).toBe(true);
    expect(decisao.conflitos).toEqual([]);
  });

  it('sem pendência local a nuvem substitui o registo', () => {
    const local = localPendente({ _is_synced: 1, _is_deleted: 0 });
    const decisao = mesclarEventoDeAtivo(local, daNuvem(), false);

    expect(decisao.registo.descricaodoativo).toBe('NA NUVEM');
    expect(decisao.registo._auditor).toBe('BRUNO');
    expect(decisao.alterou).toBe(true);
  });

  it('com pendência, a conferência da nuvem mais recente entra e o resto local fica', () => {
    const decisao = mesclarEventoDeAtivo(localPendente(), daNuvem(), true);

    // Nuvem vence no grupo da conferência (leitura das 10:00 > 09:00).
    expect(decisao.registo._auditor).toBe('BRUNO');
    expect(decisao.registo._dataLeitura).toBe('2026-11-20T10:00:00.000Z');
    expect(decisao.registo.status).toBe('CONFERIDO');
    // Este aparelho mantém o resto e a pendência (ainda por subir).
    expect(decisao.registo.descricaodoativo).toBe('EDITADO AQUI');
    expect(decisao.registo.endereco).toBe('RUA LOCAL, 10');
    expect(decisao.registo._is_synced).toBe(0);
    expect(decisao.conflitos).toContain('conferencia');
    expect(decisao.alterou).toBe(true);
  });

  it('com pendência e conferência local mais recente, o evento não desfaz nada', () => {
    const local = localPendente();
    const nuvem = daNuvem({ _auditor: 'BRUNO', _dataLeitura: '2026-11-20T08:00:00.000Z' });

    const decisao = mesclarEventoDeAtivo(local, nuvem, true);

    expect(decisao.registo._auditor).toBe('ANA');
    expect(decisao.registo._dataLeitura).toBe('2026-11-20T09:00:00.000Z');
    expect(decisao.registo.descricaodoativo).toBe('EDITADO AQUI');
    // Nada mudou: o chamador não escreve estado nem disco por este evento.
    expect(decisao.alterou).toBe(false);
  });

  it('o ponto de GPS da nuvem mais recente entra (nas duas grafias)', () => {
    const decisao = mesclarEventoDeAtivo(
      localPendente(),
      daNuvem({ _dataLeitura: '2026-11-20T10:00:00.000Z', gps_lat: -15.8, gps_lng: -47.9 }),
      true
    );

    expect(decisao.registo.latitude).toBe(-15.8);
    expect(decisao.registo.longitude).toBe(-47.9);
    expect(decisao.registo.gps_lat).toBe(-15.8);
    expect(decisao.registo.descricaodoativo).toBe('EDITADO AQUI');
    expect(decisao.conflitos).toContain('gps');
  });
});

describe('avancarCheckpoint — só o carimbo da nuvem conta', () => {
  it('avança para um carimbo posterior', () => {
    expect(avancarCheckpoint('2026-11-20T09:00:00.000Z', '2026-11-20T10:00:00.000Z')).toBe(
      '2026-11-20T10:00:00.000Z'
    );
  });

  it('não retrocede com um carimbo anterior', () => {
    expect(avancarCheckpoint('2026-11-20T10:00:00.000Z', '2026-11-20T09:00:00.000Z')).toBe(
      '2026-11-20T10:00:00.000Z'
    );
  });

  it('ignora carimbo ausente ou ilegível', () => {
    expect(avancarCheckpoint('2026-11-20T10:00:00.000Z', undefined)).toBe('2026-11-20T10:00:00.000Z');
    expect(avancarCheckpoint('2026-11-20T10:00:00.000Z', '')).toBe('2026-11-20T10:00:00.000Z');
    expect(avancarCheckpoint('2026-11-20T10:00:00.000Z', 'ontem')).toBe('2026-11-20T10:00:00.000Z');
  });
});

describe('linhasQueMudaram — a reconciliação grava só o delta', () => {
  it('devolve a linha que não existia no estado (linha nova da nuvem)', () => {
    const nova = localPendente({ id: 'PK-NOVA', etiqueta: '009999' });

    const alteradas = linhasQueMudaram([localPendente()], [localPendente(), nova], ['PK-NOVA']);

    expect(alteradas).toEqual([nova]);
  });

  it('não devolve uma linha que o merge deixou igual (mesmo com outra ordem de chaves)', () => {
    const anterior = localPendente();
    const reordenada = Object.fromEntries(
      Object.entries(anterior as unknown as Record<string, unknown>).reverse()
    ) as unknown as Asset;

    const alteradas = linhasQueMudaram([anterior], [reordenada], ['PK-1']);

    expect(alteradas).toEqual([]);
  });

  it('devolve a versão final (do resultado) da linha que mudou', () => {
    const anterior = localPendente({ _auditor: 'ANA' });
    const final = localPendente({ _auditor: 'BRUNO', _dataLeitura: '2026-11-20T10:00:00.000Z' });

    const alteradas = linhasQueMudaram([anterior], [final], ['PK-1']);

    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]).toBe(final);
  });

  it('ignora ids visitados que não têm registo no resultado', () => {
    const alteradas = linhasQueMudaram([localPendente()], [localPendente()], ['PK-APAGADO']);
    expect(alteradas).toEqual([]);
  });

  it('não grava linhas fora do delta, mesmo que tenham mudado', () => {
    const foraDoDelta = localPendente({ id: 'PK-2', _auditor: 'CARLOS' });

    const alteradas = linhasQueMudaram(
      [localPendente(), localPendente({ id: 'PK-2' })],
      [localPendente(), foraDoDelta],
      ['PK-1']
    );

    expect(alteradas).toEqual([]);
  });
});

describe('linhasQueMudaram — o evento singular grava só a linha que tocou', () => {
  it('num UPDATE devolve exactamente a linha do evento', () => {
    const antes = [localPendente({ id: 'PK-1' }), localPendente({ id: 'PK-2' })];
    const evento = localPendente({ id: 'PK-1', _auditor: 'BRUNO' });
    // A outra linha também mudou no resultado: não é a do evento, não vai ao disco.
    const depois = [evento, localPendente({ id: 'PK-2', _auditor: 'CARLOS' })];

    const alteradas = linhasQueMudaram(antes, depois, ['PK-1']);

    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]).toBe(evento);
  });

  it('num INSERT devolve a linha nova do evento', () => {
    const nova = localPendente({ id: 'PK-NOVA', etiqueta: '009999' });

    const alteradas = linhasQueMudaram([localPendente()], [localPendente(), nova], ['PK-NOVA']);

    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]).toBe(nova);
  });

  it('num DELETE não sobra linha para gravar', () => {
    const antes = [localPendente(), localPendente({ id: 'PK-2' })];
    const depois = antes.filter(ativo => String(ativo.id) !== 'PK-2');

    expect(linhasQueMudaram(antes, depois, ['PK-2'])).toEqual([]);
  });
});

describe('linhasQueMudaram — a foto sincronizada grava só a linha do ativo', () => {
  it('devolve só o ativo cuja `_photoUrl` mudou', () => {
    const antes = [localPendente({ id: 'PK-1' }), localPendente({ id: 'PK-2' })];
    const comFoto = localPendente({ id: 'PK-1', _photoUrl: 'https://nuvem/foto.jpg' });

    const alteradas = linhasQueMudaram(antes, [comFoto, antes[1]], ['PK-1']);

    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]).toBe(comFoto);
  });

  it('não grava quando a foto é a mesma (evento repetido)', () => {
    const antes = [localPendente({ id: 'PK-1', _photoUrl: 'https://nuvem/foto.jpg' })];
    const igual = { ...antes[0] } as unknown as Asset;

    expect(linhasQueMudaram(antes, [igual], ['PK-1'])).toEqual([]);
  });

  it('não grava quando o ativo não está no estado', () => {
    expect(linhasQueMudaram([localPendente()], [localPendente()], ['PK-AUSENTE'])).toEqual([]);
  });
});

describe('idsComPendencia — flag persistida e toques da sessão, sem repetidos', () => {
  it('junta as duas provas e remove duplicados', () => {
    const ativos = [
      localPendente({ id: 'PK-1' }),
      localPendente({ id: 'PK-2', _is_synced: 1 }),
      localPendente({ id: 'PK-3', _is_synced: 1 })
    ];

    const ids = idsComPendencia(ativos, new Set(['PK-2', 'PK-1']));

    expect([...ids].sort()).toEqual(['PK-1', 'PK-2']);
  });
});
