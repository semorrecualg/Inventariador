import { describe, expect, it } from 'vitest';
import { DecisorDePerimetro } from '../utils/gpsPerimeter';

const ANCORA = { lat: -16.706719, lng: -49.106422 };
const METROS_POR_GRAU = 111_320;

/** Ponto a `metros` ao norte da âncora (mesma longitude). */
const aMetros = (metros: number) => ({ lat: ANCORA.lat + metros / METROS_POR_GRAU, lng: ANCORA.lng });

const T0 = 1_700_000_000_000;

/** Avalia um ponto a `metros` da âncora com precisão declarada. */
const avaliar = (
  decisor: DecisorDePerimetro,
  metros: number,
  accuracy: number | unknown = 10,
  agora: number = T0
) => decisor.avaliar({ ...aMetros(metros), accuracy }, ANCORA, agora);

describe('DecisorDePerimetro — dentro do raio', () => {
  it('libera um ponto claramente dentro do raio', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    const resultado = avaliar(decisor, 50);

    expect(resultado.decisao).toBe('dentro');
    expect(resultado.decisao !== 'ignorar' && resultado.distanciaM).toBeGreaterThan(45);
    expect(resultado.decisao !== 'ignorar' && resultado.distanciaM).toBeLessThan(55);
  });

  it('devolve a coordenada aceite para a guarda carimbar', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    const leitura = aMetros(30);
    const resultado = decisor.avaliar({ ...leitura, accuracy: 10 }, ANCORA, T0);

    expect(resultado.decisao).not.toBe('ignorar');
    if (resultado.decisao !== 'ignorar') {
      expect(resultado.lat).toBeCloseTo(leitura.lat, 9);
      expect(resultado.lng).toBeCloseTo(leitura.lng, 9);
    }
  });
});

describe('DecisorDePerimetro — histerese', () => {
  it('tolera 5 % além da borda sem considerar fora', () => {
    // 104 m < 105 m (raio + 5 %) continua liberado...
    const dentroDaFolga = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(dentroDaFolga, 104).decisao).toBe('dentro');

    // ...e 110 m, já fora da folga, apenas confirma.
    const foraDaFolga = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(foraDaFolga, 110).decisao).toBe('fora-confirmando');
  });

  it('duas leituras seguidas dentro da folga continuam liberadas', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(decisor, 90, 10, T0).decisao).toBe('dentro');
    expect(avaliar(decisor, 104, 10, T0 + 5_000).decisao).toBe('dentro');
  });

  it('só bloqueia à segunda leitura seguida fora do perímetro', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 120, 10, T0).decisao).toBe('fora-confirmando');
    expect(avaliar(decisor, 130, 10, T0 + 5_000).decisao).toBe('fora');
    // Continua bloqueado enquanto estiver fora.
    expect(avaliar(decisor, 140, 10, T0 + 10_000).decisao).toBe('fora');
  });

  it('voltar ao raio zera a sequência de leituras fora', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 120, 10, T0).decisao).toBe('fora-confirmando');
    expect(avaliar(decisor, 100, 10, T0 + 5_000).decisao).toBe('dentro');
    // Depois de voltar, uma única leitura fora não bloqueia de novo.
    expect(avaliar(decisor, 120, 10, T0 + 10_000).decisao).toBe('fora-confirmando');
  });

  it('reset() esquece a sequência de leituras fora', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 120, 10, T0).decisao).toBe('fora-confirmando');
    decisor.reset();
    expect(avaliar(decisor, 130, 10, T0 + 60_000).decisao).toBe('fora-confirmando');
  });

  it('respeita uma sequência maior quando configurada', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100, leiturasParaBloquear: 3 });

    expect(avaliar(decisor, 120, 10, T0).decisao).toBe('fora-confirmando');
    expect(avaliar(decisor, 130, 10, T0 + 5_000).decisao).toBe('fora-confirmando');
    expect(avaliar(decisor, 140, 10, T0 + 10_000).decisao).toBe('fora');
  });
});

describe('DecisorDePerimetro — leitura grosseira na primeira leitura', () => {
  it('decide o perímetro com precisão de rede (acima de COLLECT, até DISCARD)', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    // 120 m de precisão: imprecisa para carimbar no mapa (COLLECT = 50 m), mas
    // suficiente para medir o raio — não pode deixar a tela em "Verificando".
    const resultado = avaliar(decisor, 50, 120);

    expect(resultado.decisao).toBe('dentro');
  });

  it('uma leitura grosseira fora do raio também confirma antes de bloquear', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(decisor, 120, 140).decisao).toBe('fora-confirmando');
  });

  it('ignora leitura grosseira demais na primeira leitura', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(decisor, 50, 400).decisao).toBe('ignorar');
  });

  it('ignora leitura sem precisão declarada ou inválida', () => {
    const semPrecisao = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(semPrecisao, 50, Number.NaN).decisao).toBe('ignorar');

    const semCampo = new DecisorDePerimetro({ raioM: 100 });
    expect(
      semCampo.avaliar({ ...aMetros(50) }, ANCORA, T0).decisao
    ).toBe('ignorar');

    const zeroZero = new DecisorDePerimetro({ raioM: 100 });
    expect(zeroZero.avaliar({ lat: 0, lng: 0, accuracy: 10 }, ANCORA, T0).decisao).toBe('ignorar');

    const foraDaFaixa = new DecisorDePerimetro({ raioM: 100 });
    expect(foraDaFaixa.avaliar({ lat: 91, lng: 10, accuracy: 10 }, ANCORA, T0).decisao).toBe('ignorar');
  });

  it('aceita a primeira leitura grosseira e depois passa a exigir qualidade', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });
    expect(avaliar(decisor, 50, 120, T0).decisao).toBe('dentro');
    // Já há leitura aceite: uma leitura fora do padrão não decide nada.
    expect(avaliar(decisor, 400, 400, T0 + 40_000).decisao).toBe('ignorar');
  });
});

describe('DecisorDePerimetro — leitura repetida ignorada', () => {
  it('não recalcula com a mesma coordenada e pouco tempo', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 50, 10, T0).decisao).toBe('dentro');
    expect(avaliar(decisor, 50, 10, T0 + 1_000).decisao).toBe('ignorar');
  });

  it('não avança a sequência de leituras fora', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 120, 10, T0).decisao).toBe('fora-confirmando');
    // Repetida: ignorada, não conta como segunda leitura.
    expect(avaliar(decisor, 120, 10, T0 + 1_000).decisao).toBe('ignorar');
    expect(avaliar(decisor, 130, 10, T0 + 5_000).decisao).toBe('fora');
  });

  it('volta a decidir quando o aparelho se desloca de facto', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(avaliar(decisor, 50, 10, T0).decisao).toBe('dentro');
    expect(avaliar(decisor, 60, 10, T0 + 1_000).decisao).toBe('dentro');
  });
});

describe('DecisorDePerimetro — âncora', () => {
  it('lança erro quando a âncora não é real', () => {
    const decisor = new DecisorDePerimetro({ raioM: 100 });

    expect(() => decisor.avaliar({ ...aMetros(10), accuracy: 10 }, { lat: 0, lng: 0 }, T0)).toThrow(
      /ancoragem/
    );
    expect(() =>
      decisor.avaliar({ ...aMetros(10), accuracy: 10 }, { lat: null, lng: null }, T0)
    ).toThrow(/ancoragem/);
    expect(() =>
      decisor.avaliar({ ...aMetros(10), accuracy: 10 }, { lat: undefined, lng: undefined }, T0)
    ).toThrow(/ancoragem/);
  });
});
