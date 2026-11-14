import { logger } from './logger';

/**
 * F0 — Cronômetro do boot, do pull (completo/delta) e do push.
 *
 * Amostras ficam num anel em `localStorage` (`gbr_perf_samples_v1`, últimas 200)
 * e a linha de base é um retrato datado (`gbr_perf_baseline_v1`), exibido no
 * Gestor de Base de Dados. Sem backend: medição é local, por aparelho.
 *
 * Nada aqui altera o fluxo medido — as chamadas são O(1) e nunca lançam
 * (storage indisponível é ignorado).
 */

export type PerfMetricName = 'boot' | 'pull.full' | 'pull.delta' | 'push';

export const PERF_METRICS: PerfMetricName[] = ['boot', 'pull.full', 'pull.delta', 'push'];

export interface PerfSample {
  name: PerfMetricName;
  ms: number;
  at: string;
  count?: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface PerfSummary {
  samples: number;
  p50: number | null;
  p95: number | null;
  last: number | null;
}

export interface MirrorCounts {
  local_assets: number;
  ativos: number;
  assets: number;
  total: number;
}

export interface PerfBaseline {
  at: string;
  /** O que disparou o retrato: fim do boot, fim de um pull completo ou botão. */
  trigger: 'boot' | 'pull.full' | 'manual';
  tenantid: string | null;
  mirrors: MirrorCounts | null;
  metrics: Record<PerfMetricName, PerfSummary>;
}

const SAMPLES_KEY = 'gbr_perf_samples_v1';
const BASELINE_KEY = 'gbr_perf_baseline_v1';
const MAX_SAMPLES = 200;

/** `performance.now()` quando existe; `Date.now()` como fallback (testes/SSR). */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

/** Marca o início de um intervalo (boot, delta, push). */
export const startPerf = (): number => now();

/** Amostras válidas, da mais antiga para a mais recente. */
export const getPerfSamples = (): PerfSample[] => {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is PerfSample => {
      if (!s || typeof s !== 'object') return false;
      const sample = s as Partial<PerfSample>;
      return (
        typeof sample.name === 'string' &&
        PERF_METRICS.includes(sample.name as PerfMetricName) &&
        typeof sample.ms === 'number' &&
        Number.isFinite(sample.ms)
      );
    });
  } catch {
    return [];
  }
};

/** Registra uma duração já medida (ex.: `elapsedMs` de um push). */
export const recordPerfSample = (
  name: PerfMetricName,
  ms: number,
  extra?: { count?: number; meta?: PerfSample['meta'] }
): PerfSample => {
  const sample: PerfSample = {
    name,
    ms: Math.max(0, Math.round(ms)),
    at: new Date().toISOString(),
    ...(extra?.count !== undefined ? { count: extra.count } : {}),
    ...(extra?.meta ? { meta: extra.meta } : {})
  };
  const countLabel = sample.count !== undefined ? ` · ${sample.count} registro(s)` : '';
  logger.info(`>>> [PERF] ${name}: ${sample.ms}ms${countLabel}`);
  const storage = safeStorage();
  if (storage) {
    try {
      const list = getPerfSamples();
      list.push(sample);
      storage.setItem(SAMPLES_KEY, JSON.stringify(list.slice(-MAX_SAMPLES)));
    } catch {
      /* quota/indisponível: a amostra vale só para o log */
    }
  }
  return sample;
};

/** Registra a partir de um `startPerf()` (usa o mesmo relógio). */
export const recordPerf = (
  name: PerfMetricName,
  startedAt: number,
  extra?: { count?: number; meta?: PerfSample['meta'] }
): PerfSample => recordPerfSample(name, now() - startedAt, extra);

/** p50/p95 por posto (nearest-rank) — sem dependências. */
export const summarizeSamples = (samples: PerfSample[], name: PerfMetricName): PerfSummary => {
  const values = samples
    .filter(s => s.name === name)
    .map(s => s.ms)
    .sort((a, b) => a - b);
  if (values.length === 0) return { samples: 0, p50: null, p95: null, last: null };
  const at = (p: number): number => values[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)];
  return {
    samples: values.length,
    p50: at(50),
    p95: at(95),
    last: values[values.length - 1]
  };
};

/** Resumo de todas as métricas (para o painel e para a linha de base). */
export const collectPerfSummary = (): Record<PerfMetricName, PerfSummary> => {
  const samples = getPerfSamples();
  return PERF_METRICS.reduce((acc, name) => {
    acc[name] = summarizeSamples(samples, name);
    return acc;
  }, {} as Record<PerfMetricName, PerfSummary>);
};

export const clearPerfSamples = (): void => {
  try {
    safeStorage()?.removeItem(SAMPLES_KEY);
  } catch {
    /* ignore */
  }
};

/** Retrato datado: contagem por espelho + p50/p95 das métricas disponíveis. */
export const savePerfBaseline = (input: {
  tenantid: string | null;
  mirrors: MirrorCounts | null;
  trigger?: PerfBaseline['trigger'];
}): PerfBaseline => {
  const baseline: PerfBaseline = {
    at: new Date().toISOString(),
    trigger: input.trigger ?? 'manual',
    tenantid: input.tenantid,
    mirrors: input.mirrors,
    metrics: collectPerfSummary()
  };
  try {
    safeStorage()?.setItem(BASELINE_KEY, JSON.stringify(baseline));
  } catch {
    /* ignore */
  }
  logger.info(
    `>>> [PERF] Linha de base registrada (${baseline.trigger})${input.tenantid ? ` (${input.tenantid})` : ''}: ` +
      `mirrors=${input.mirrors ? `${input.mirrors.local_assets}/${input.mirrors.ativos}/${input.mirrors.assets}` : 'n/d'} · ` +
      PERF_METRICS.map(name => {
        const s = baseline.metrics[name];
        return `${name}=${s.samples > 0 ? `${s.p50}ms(p50)/${s.p95}ms(p95) n=${s.samples}` : 'sem amostra'}`;
      }).join(' · ')
  );
  return baseline;
};

/** Snapshot em JSON indentado — é o texto do botão Copiar/Exportar. */
export const formatPerfBaseline = (baseline: PerfBaseline): string =>
  JSON.stringify(baseline, null, 2);

export const readPerfBaseline = (): PerfBaseline | null => {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BASELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PerfBaseline>;
    if (!parsed || typeof parsed.at !== 'string' || typeof parsed.metrics !== 'object') return null;
    return parsed as PerfBaseline;
  } catch {
    return null;
  }
};
