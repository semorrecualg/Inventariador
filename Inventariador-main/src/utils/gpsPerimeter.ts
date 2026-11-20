/**
 * Decisão do perímetro da guarda de conformidade — módulo puro.
 *
 * Reúne as regras que decidem se o aparelho está dentro do raio da unidade:
 *
 *  1. **anti-jitter** (`gpsCore`): leitura imprecisa, repetida (parado) ou
 *     salto impossível não recalcula o perímetro — evita a tela piscando entre
 *     «liberado» e «fora» e reduz re-render/bateria;
 *  2. **leitura grosseira na primeira leitura**: enquanto a guarda não decidiu
 *     nada, uma leitura de rede/célula (até `GPS_ACCURACY.DISCARD`) ainda mede o
 *     raio — sem isto o sinal fraco de campo prendia a tela em «Verificando
 *     perímetro», sem liberar nem bloquear;
 *  3. **histerese**: 5 % de folga na borda e duas leituras seguidas fora para
 *     bloquear, para que uma antena ruim isolada não tranque o auditor.
 *
 * Puro (sem React, Capacitor ou storage) para poder ser testado à parte.
 *
 * @see docs/GPS_ANCORA_E_MAPA_DE_CALOR.md
 */
import { distanceMeters, GpsJitterFilter, GPS_ACCURACY, isValidCoordinate } from './gpsCore';
import { hasRealAnchor } from './gpsAnchors';

/** O que a guarda deve fazer com a leitura. */
export type DecisaoDePerimetro = 'dentro' | 'fora-confirmando' | 'fora' | 'ignorar';

export type ResultadoDePerimetro =
  | { decisao: 'ignorar' }
  | {
      decisao: Exclude<DecisaoDePerimetro, 'ignorar'>;
      /** Distância até a âncora, em metros. */
      distanciaM: number;
      /** Coordenada usada na decisão — a aceite pelo filtro, não a bruta. */
      lat: number;
      lng: number;
    };

export interface LeituraDePerimetro {
  lat: unknown;
  lng: unknown;
  accuracy?: unknown;
}

export interface AncoragemDePerimetro {
  lat: unknown;
  lng: unknown;
}

export interface OpcoesDePerimetro {
  /** Raio liberado da unidade, em metros. Default: 500 (o mesmo do componente). */
  raioM?: number;
  /** Folga na borda, como fração do raio. Default: 0.05 (5 %). */
  tolerancia?: number;
  /** Leituras seguidas fora do perímetro necessárias para bloquear. Default: 2. */
  leiturasParaBloquear?: number;
  /**
   * Precisão máxima aceita para a primeira leitura. Default:
   * `GPS_ACCURACY.DISCARD` — o perímetro tolera leitura mais grosseira do que o
   * carimbo da posição do ativo (que exige `COLLECT`, 50 m).
   */
  maxAccuracyM?: number;
}

/**
 * Decide o perímetro de uma unidade a partir das leituras do sensor.
 *
 * Guarda estado apenas do que é preciso para a histerese: a última leitura
 * aceite (dentro do `GpsJitterFilter`) e a sequência de leituras fora.
 */
export class DecisorDePerimetro {
  private readonly raioM: number;
  private readonly tolerancia: number;
  private readonly leiturasParaBloquear: number;
  private readonly maxAccuracyM: number;
  private readonly filtro: GpsJitterFilter;
  private leiturasFora = 0;

  constructor(opcoes: OpcoesDePerimetro = {}) {
    this.raioM = opcoes.raioM ?? 500;
    this.tolerancia = opcoes.tolerancia ?? 0.05;
    this.leiturasParaBloquear = Math.max(1, opcoes.leiturasParaBloquear ?? 2);
    this.maxAccuracyM = opcoes.maxAccuracyM ?? GPS_ACCURACY.DISCARD;
    this.filtro = new GpsJitterFilter({ maxAccuracyM: this.maxAccuracyM });
  }

  /** Esquece a leitura aceite e a sequência de leituras fora (nova âncora). */
  reset(): void {
    this.filtro.reset();
    this.leiturasFora = 0;
  }

  /**
   * Avalia uma leitura contra a âncora da unidade.
   *
   * Lança `Error` quando a âncora não é real (`hasRealAnchor`): isso é falha de
   * configuração da unidade, não perímetro violado — a guarda trata como
   * failsafe, e não como bloqueio.
   */
  avaliar(
    leitura: LeituraDePerimetro,
    ancora: AncoragemDePerimetro,
    agora: number = Date.now()
  ): ResultadoDePerimetro {
    if (!hasRealAnchor(ancora.lat, ancora.lng)) {
      throw new Error('Coordenadas de ancoragem inválidas ou ausentes.');
    }

    const lat = Number(leitura.lat);
    const lng = Number(leitura.lng);
    const accuracy = Number(leitura.accuracy);
    const candidata = { lat, lng, accuracy, source: 'sensor' as const, at: agora };

    // O filtro usa o mesmo relógio da decisão: quem decide já passou `agora`, e
    // misturar `Date.now()` aqui transforma qualquer deslocamento em «salto
    // impossível» (o instante da última leitura deixa de bater com o actual).
    let fix = this.filtro.accept(candidata, agora) ? this.filtro.lastAccepted : null;

    if (!fix) {
      // Já há decisão: leitura repetida (parado) ou salto impossível é ruído —
      // não muda o perímetro nem avança a sequência de leituras fora.
      if (this.filtro.lastAccepted) return { decisao: 'ignorar' };

      // Ainda sem decisão: só uma leitura plausível mede o raio. Imprecisa
      // demais, inválida ou sem precisão declarada continua a ser ignorada.
      const plausivel =
        isValidCoordinate(lat, lng) &&
        Number.isFinite(accuracy) &&
        accuracy > 0 &&
        accuracy <= this.maxAccuracyM;
      if (!plausivel) return { decisao: 'ignorar' };

      fix = candidata;
    }

    const distanciaM = distanceMeters(
      { lat: fix.lat, lng: fix.lng },
      { lat: Number(ancora.lat), lng: Number(ancora.lng) }
    );

    // HISTERESE: folga na borda. Dentro dela, o auditor continua liberado.
    if (distanciaM <= this.raioM * (1 + this.tolerancia)) {
      this.leiturasFora = 0;
      return { decisao: 'dentro', distanciaM, lat: fix.lat, lng: fix.lng };
    }

    this.leiturasFora += 1;
    return {
      decisao: this.leiturasFora < this.leiturasParaBloquear ? 'fora-confirmando' : 'fora',
      distanciaM,
      lat: fix.lat,
      lng: fix.lng,
    };
  }
}
