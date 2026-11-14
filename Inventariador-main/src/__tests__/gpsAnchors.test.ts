import { describe, it, expect } from 'vitest';
import {
  hasRealAnchor,
  isRealAnchorRecord,
  collectGpsAnchorsFromStorage,
  mergeUnitConfigIntoList
} from '../utils/gpsAnchors';

/** Mock mínimo de Storage (sem jsdom) — expõe length/key/getItem como propriedade/métodos. */
const makeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null
  };
};

describe('hasRealAnchor', () => {
  it('aceita coordenadas finitas e não-zero', () => {
    expect(hasRealAnchor(-16.706719, -49.106422)).toBe(true);
  });
  it('aceita strings numéricas (coerção)', () => {
    expect(hasRealAnchor('-16.7', '-49.1')).toBe(true);
  });
  it('rejeita zero', () => {
    expect(hasRealAnchor(0, 0)).toBe(false);
    expect(hasRealAnchor(-16.7, 0)).toBe(false);
  });
  it('rejeita null/undefined/NaN/string não numérica', () => {
    expect(hasRealAnchor(null, null)).toBe(false);
    expect(hasRealAnchor(undefined, undefined)).toBe(false);
    expect(hasRealAnchor(NaN, NaN)).toBe(false);
    expect(hasRealAnchor('abc', '-49.1')).toBe(false);
  });
});

describe('isRealAnchorRecord', () => {
  it('aceita âncora com leitura de sensor', () => {
    expect(isRealAnchorRecord({ lat: -16.7, lng: -49.1, source: 'sensor' })).toBe(true);
  });
  it('rejeita âncora posicionada manualmente no mapa', () => {
    expect(isRealAnchorRecord({ lat: -16.7, lng: -49.1, source: 'manual' })).toBe(false);
  });
  it('mantém registros legados (sem source) como âncora real', () => {
    expect(isRealAnchorRecord({ lat: -16.7, lng: -49.1 })).toBe(true);
  });
  it('rejeita coordenadas inválidas mesmo com source sensor', () => {
    expect(isRealAnchorRecord({ lat: 0, lng: 0, source: 'sensor' })).toBe(false);
    expect(isRealAnchorRecord({ lat: null, lng: null, source: 'sensor' })).toBe(false);
    expect(isRealAnchorRecord(null)).toBe(false);
    expect(isRealAnchorRecord(undefined)).toBe(false);
  });
});

describe('collectGpsAnchorsFromStorage', () => {
  it('coleta âncoras válidas do localStorage (kardek_gps_ancora_*) com chave normalizada', () => {
    const local = makeStorage({
      'kardek_gps_ancora_010101 CICOPAL GO': JSON.stringify({
        filial: '010101 CICOPAL GO',
        unit_id: '010101 CICOPAL GO',
        lat: -16.7,
        lng: -49.1
      })
    });
    const anchors = collectGpsAnchorsFromStorage(local, makeStorage());
    expect(anchors.has('010101 CICOPAL GO')).toBe(true);
  });

  it('normaliza underscores/espaços na chave', () => {
    const local = makeStorage({
      'kardek_gps_ancora_010101_CICOPAL_GO': JSON.stringify({
        _unitid: '010101 CICOPAL GO',
        lat: -16.7,
        lng: -49.1
      })
    });
    const anchors = collectGpsAnchorsFromStorage(local, makeStorage());
    expect(anchors.has('010101 CICOPAL GO')).toBe(true);
  });

  it('ignora âncoras com coordenadas zero/NaN/nulas', () => {
    const local = makeStorage({
      'kardek_gps_ancora_UNIDADE_ZERO': JSON.stringify({ filial: 'ZERO', lat: 0, lng: 0 }),
      'kardek_gps_ancora_UNIDADE_NULL': JSON.stringify({ filial: 'NULL', lat: null, lng: null }),
      'kardek_gps_ancora_UNIDADE_OK': JSON.stringify({ filial: 'OK', lat: -15.7, lng: -47.9 })
    });
    const anchors = collectGpsAnchorsFromStorage(local, makeStorage());
    expect(anchors.has('ZERO')).toBe(false);
    expect(anchors.has('NULL')).toBe(false);
    expect(anchors.has('OK')).toBe(true);
  });

  it('ignora âncora posicionada manualmente no mapa (clique/arraste)', () => {
    const local = makeStorage({
      'kardek_gps_ancora_MANUAL': JSON.stringify({
        filial: 'MANUAL',
        lat: -15.7,
        lng: -47.9,
        source: 'manual'
      })
    });
    expect(collectGpsAnchorsFromStorage(local, makeStorage()).has('MANUAL')).toBe(false);
  });

  it('conta âncora gravada com source sensor', () => {
    const local = makeStorage({
      'kardek_gps_ancora_SENSOR': JSON.stringify({
        filial: 'SENSOR',
        lat: -15.7,
        lng: -47.9,
        source: 'sensor'
      })
    });
    expect(collectGpsAnchorsFromStorage(local, makeStorage()).has('SENSOR')).toBe(true);
  });

  it('não quebra com JSON malformado (ignora o registro)', () => {
    const local = makeStorage({ 'kardek_gps_ancora_QUEBRADA': '{not-json' });
    expect(() => collectGpsAnchorsFromStorage(local, makeStorage())).not.toThrow();
    expect(collectGpsAnchorsFromStorage(local, makeStorage()).size).toBe(0);
  });

  it('coleta pares gps_lat_/gps_lng_ do sessionStorage com config de sensor salva', () => {
    const session = makeStorage({
      'gps_lat_010105 CICOPAL PA': '-15.7',
      'gps_lng_010105 CICOPAL PA': '-47.9',
      'unit_gps_config_010105 CICOPAL PA': JSON.stringify({ source: 'sensor' })
    });
    const anchors = collectGpsAnchorsFromStorage(makeStorage(), session);
    expect(anchors.has('010105 CICOPAL PA')).toBe(true);
  });

  it('não conta rascunho de sessão sem config salva (posicionamento manual)', () => {
    const session = makeStorage({
      'gps_lat_010105 CICOPAL PA': '-15.7',
      'gps_lng_010105 CICOPAL PA': '-47.9'
    });
    const anchors = collectGpsAnchorsFromStorage(makeStorage(), session);
    expect(anchors.has('010105 CICOPAL PA')).toBe(false);
  });

  it('não conta par de sessão de unidade cuja âncora salva é manual', () => {
    const session = makeStorage({
      'gps_lat_010105 CICOPAL PA': '-15.7',
      'gps_lng_010105 CICOPAL PA': '-47.9',
      'unit_gps_config_010105 CICOPAL PA': JSON.stringify({ source: 'manual' })
    });
    const anchors = collectGpsAnchorsFromStorage(makeStorage(), session);
    expect(anchors.has('010105 CICOPAL PA')).toBe(false);
  });

  it('exclui par do sessionStorage sem lng correspondente', () => {
    const session = makeStorage({ 'gps_lat_010301 FEIRA BOA BA': '-12.9' });
    const anchors = collectGpsAnchorsFromStorage(makeStorage(), session);
    expect(anchors.has('010301 FEIRA BOA BA')).toBe(false);
  });

  it('retorna conjunto vazio e sem throw quando o storage lança', () => {
    const throwing = {
      get length(): number {
        throw new Error('denied');
      },
      key: () => null,
      getItem: () => null
    };
    expect(() => collectGpsAnchorsFromStorage(throwing, makeStorage())).not.toThrow();
    expect(collectGpsAnchorsFromStorage(throwing, makeStorage()).size).toBe(0);
  });
});

describe('mergeUnitConfigIntoList (contrato onUpdateConfigs)', () => {
  it('adiciona config quando a unidade não existe na lista', () => {
    const result = mergeUnitConfigIntoList(
      [{ unit_id: '010105 CICOPAL PA' }],
      { unit_id: '010101 CICOPAL GO', lat: -16.7, lng: -49.1 }
    );
    expect(result.map(c => c.unit_id)).toEqual(['010105 CICOPAL PA', '010101 CICOPAL GO']);
  });

  it('merge (sobrescreve campos) quando a unidade já existe, sem duplicar', () => {
    const result = mergeUnitConfigIntoList(
      [{ unit_id: '010101 CICOPAL GO', lat: 0, lng: 0 }],
      { unit_id: '010101 CICOPAL GO', lat: -16.7, lng: -49.1 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(-16.7);
    expect(result[0].lng).toBe(-49.1);
  });

  it('não muta a lista de entrada', () => {
    const input = [{ unit_id: '010101 CICOPAL GO', lat: 1, lng: 1 }];
    const result = mergeUnitConfigIntoList(input, { unit_id: '010101 CICOPAL GO', lat: -16.7, lng: -49.1 });
    expect(input[0].lat).toBe(1); // entrada intacta
    expect(result).not.toBe(input); // nova referência
    expect(result[0].lat).toBe(-16.7);
  });

  it('trata config sem unit_id como nova entrada', () => {
    const result = mergeUnitConfigIntoList([{ unit_id: 'A' }], { filial: 'SEM_ID' });
    expect(result).toHaveLength(2);
  });
});
