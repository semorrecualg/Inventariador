/**
 * Núcleo único de GPS do app — validação, qualidade e estabilização.
 *
 * REGRA DE OURO: coordenada só entra no inventário, na âncora ou no Mapa de
 * Calor se passar por aqui. Nada de `Math.random()`, nada de "chute" na âncora
 * da unidade: se o sensor não entregou uma leitura utilizável, o resultado é
 * `null` e a tela mostra "sem sinal" — nunca um ponto inventado no mapa.
 *
 * Este módulo é puro (sem React, sem Capacitor, sem storage) para poder ser
 * usado por componentes, serviços e testes sem efeitos colaterais.
 *
 * @see docs/GPS_ANCORA_E_MAPA_DE_CALOR.md
 */

/** Uma leitura de GPS já normalizada. */
export interface GpsFix {
  /** Latitude em graus decimais (WGS-84). */
  lat: number;
  /** Longitude em graus decimais (WGS-84). */
  lng: number;
  /** Precisão horizontal informada pelo sensor, em metros. */
  accuracy: number;
  /**
   * `sensor`  → leitura real do aparelho.
   * `synthetic` → coordenada de contingência (âncora/admin/sandbox). NUNCA deve
   * ser gravada como localização do ativo nem alimentar o mapa de calor.
   */
  source: 'sensor' | 'synthetic';
  /** Epoch em ms do momento da leitura. */
  at: number;
  /** Altitude em metros, quando o aparelho informa. */
  altitude?: number | null;
}

/** Faixas de precisão (metros) usadas como contrato em todo o app. */
export const GPS_ACCURACY = {
  /** Precisão exigida para carimbar a posição de um ativo no mapa de calor. */
  COLLECT: 50,
  /** Acima disto a leitura é ruído de rede/ célula e é descartada. */
  DISCARD: 150,
  /** Distância a partir da qual uma leitura é considerada salto impossível. */
  MAX_JUMP_METERS: 300,
} as const

/** Intervalo mínimo (ms) entre duas gravações de posição do mesmo ativo. */
const GPS_MIN_INTERVAL_MS = 30_000;

/** Deslocamento mínimo (m) para considerar que o aparelho realmente se moveu. */
const GPS_MIN_MOVE_METERS = 5;

/**
 * Coordenada geograficamente válida e utilizável.
 *
 * Rejeita: não numérico, NaN, infinito, fora das faixas de latitude/longitude,
 * e o par (0, 0) — que é o "null disfarçado" clássico de sensor sem fix.
 */
export const isValidCoordinate = (lat: unknown, lng: unknown): boolean => {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return false;
  if (la === 0 && lo === 0) return false;
  return true;
};

/**
 * A leitura tem precisão declarada e dentro do limite pedido?
 * `maxAccuracyM` default = `GPS_ACCURACY.COLLECT`.
 */
export const isPreciseFix = (
  fix: Pick<GpsFix, 'accuracy'> | null | undefined,
  maxAccuracyM: number = GPS_ACCURACY.COLLECT
): boolean => {
  if (!fix) return false;
  const acc = Number(fix.accuracy);
  return Number.isFinite(acc) && acc > 0 && acc <= maxAccuracyM;
};

/** Distância em metros entre dois pontos (Haversine). */
export const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

interface JitterOptions {
  /** Precisão máxima aceita (m). Default: `GPS_ACCURACY.COLLECT`. */
  maxAccuracyM?: number;
  /** Salto máximo aceito entre duas leituras (m). Default: `MAX_JUMP_METERS`. */
  maxJumpMeters?: number;
  /** Intervalo mínimo entre leituras aceitas (ms). Default: `GPS_MIN_INTERVAL_MS`. */
  minIntervalMs?: number;
  /** Deslocamento mínimo para valer como nova leitura (m). Default: `MIN_MOVE_METERS`. */
  minMoveMeters?: number;
}

/**
 * Filtro anti-jitter com histerese.
 *
 * O sensor de celular oscila alguns metros mesmo parado, e a rede celular
 * "salta" centenas de metros. Este filtro descarta:
 *  - leitura inválida ou imprecisa demais;
 *  - leitura repetida (mesmo lugar, pouco tempo);
 *  - salto grande demais para o tempo decorrido (impossível fisicamente).
 *
 * A leitura aceita anterior fica disponível em `last` e é ela que deve ser
 * usada para gravar posição — não a leitura bruta.
 */
export class GpsJitterFilter {
  private last: GpsFix | null = null;
  private readonly opts: Required<JitterOptions>;

  constructor(options: JitterOptions = {}) {
    this.opts = {
      maxAccuracyM: options.maxAccuracyM ?? GPS_ACCURACY.COLLECT,
      maxJumpMeters: options.maxJumpMeters ?? GPS_ACCURACY.MAX_JUMP_METERS,
      minIntervalMs: options.minIntervalMs ?? GPS_MIN_INTERVAL_MS,
      minMoveMeters: options.minMoveMeters ?? GPS_MIN_MOVE_METERS,
    };
  }

  /** Última leitura aceita (ou `null`). */
  get lastAccepted(): GpsFix | null {
    return this.last;
  }

  reset(): void {
    this.last = null;
  }

  /**
   * Decide se a leitura pode ser usada. Devolve `true` quando aceita — e então
   * passa a ser a nova referência.
   */
  accept(fix: GpsFix | null | undefined, now: number = Date.now()): boolean {
    if (!fix) return false;
    if (fix.source !== 'sensor') return false;
    if (!isValidCoordinate(fix.lat, fix.lng)) return false;
    if (!isPreciseFix(fix, this.opts.maxAccuracyM)) return false;

    if (!this.last) {
      this.last = { ...fix, at: now };
      return true;
    }

    const elapsed = Math.max(0, now - this.last.at);
    const moved = distanceMeters(this.last, fix);

    if (elapsed < this.opts.minIntervalMs && moved < this.opts.minMoveMeters) {
      return false;
    }

    // Salto grande em pouco tempo = ruído de célula, não deslocamento real.
    const maxSpeedMps = 15; // ~54 km/h — teto generoso para auditor a pé/veículo interno
    const allowed = Math.min(
      this.opts.maxJumpMeters,
      maxSpeedMps * Math.max(elapsed / 1000, 1)
    );
    if (moved > allowed) return false;

    this.last = { ...fix, at: now };
    return true;
  }
}

/**
 * Converte o que veio do sensor (Web/Capacitor) num `GpsFix` ou `null`.
 * Única porta de entrada aceita pelos serviços.
 */
export const toGpsFix = (
  coords: { latitude?: unknown; longitude?: unknown; accuracy?: unknown; altitude?: unknown } | null | undefined,
  at: number = Date.now()
): GpsFix | null => {
  if (!coords) return null;
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  const accuracy = Number(coords.accuracy);
  if (!isValidCoordinate(lat, lng)) return null;
  if (!Number.isFinite(accuracy) || accuracy <= 0) return null;
  const altitude = coords.altitude === null || coords.altitude === undefined ? null : Number(coords.altitude);
  return {
    lat,
    lng,
    accuracy,
    altitude: Number.isFinite(altitude as number) ? (altitude as number) : null,
    source: 'sensor',
    at,
  };
};
