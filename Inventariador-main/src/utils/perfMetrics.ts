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
const PERF_TRIGGERS: PerfBaseline['trigger'][] = ['boot', 'pull.full', 'manual'];
const EMPTY_SUMMARY: PerfSummary = { samples: 0, p50: null, p95: null, last: null };

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

/**
 * Executa uma tarefa quando a thread estiver ociosa — usada para a contagem
 * dos espelhos do auto-registro F0 não competir com o boot/persistência.
 * `requestIdleCallback` quando existe; `setTimeout(0)` como fallback.
 */
export const scheduleIdle = (task: () => void | Promise<void>, timeoutMs = 2000): void => {
  const run = (): void => { void task(); };
  const idle = (globalThis as {
    requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === 'function') idle(run, { timeout: timeoutMs });
  else setTimeout(run, 0);
};

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
  const own = samples.filter(s => s.name === name);
  if (own.length === 0) return { samples: 0, p50: null, p95: null, last: null };
  const values = own.map(s => s.ms).sort((a, b) => a - b);
  const at = (p: number): number => values[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)];
  return {
    samples: values.length,
    p50: at(50),
    p95: at(95),
    // Ordem de gravação, não de grandeza: é a amostra mais recente.
    last: own[own.length - 1].ms
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
    `>>> [PERF] Linha de base registrada (${baseline.trigger})${baseline.tenantid ? ` (${baseline.tenantid})` : ''}: ` +
      `mirrors=${baseline.mirrors ? `${baseline.mirrors.local_assets}/${baseline.mirrors.ativos}/${baseline.mirrors.assets}` : 'n/d'} · ` +
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

/**
 * Aceita snapshots antigos (gravados antes de existir `trigger`): sem gatilho
 * válido, assume `manual`. Campos em falta são normalizados, nunca rejeitados.
 */
export const normalizePerfBaseline = (raw: unknown): PerfBaseline | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<PerfBaseline> & { metrics?: unknown };
  if (typeof candidate.at !== 'string' || !candidate.metrics || typeof candidate.metrics !== 'object') {
    return null;
  }
  const trigger = PERF_TRIGGERS.includes(candidate.trigger as PerfBaseline['trigger'])
    ? (candidate.trigger as PerfBaseline['trigger'])
    : 'manual';
  const rawMetrics = candidate.metrics as Partial<Record<PerfMetricName, PerfSummary>>;
  const metrics = PERF_METRICS.reduce((acc, name) => {
    const summary = rawMetrics[name];
    acc[name] = summary && typeof summary === 'object' ? summary : EMPTY_SUMMARY;
    return acc;
  }, {} as Record<PerfMetricName, PerfSummary>);
  return {
    at: candidate.at,
    trigger,
    tenantid: typeof candidate.tenantid === 'string' ? candidate.tenantid : null,
    mirrors: candidate.mirrors && typeof candidate.mirrors === 'object'
      ? (candidate.mirrors as MirrorCounts)
      : null,
    metrics
  };
};

export const readPerfBaseline = (): PerfBaseline | null => {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(BASELINE_KEY);
    if (!raw) return null;
    return normalizePerfBaseline(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};
