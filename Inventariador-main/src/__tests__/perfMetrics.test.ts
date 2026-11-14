import { describe, it, expect } from 'vitest';
import { summarizeSamples, PERF_METRICS, type PerfSample } from '../utils/perfMetrics';

const sample = (name: PerfSample['name'], ms: number): PerfSample => ({
  name,
  ms,
  at: '2026-11-14T00:00:00.000Z'
});

describe('summarizeSamples', () => {
  it('devolve métricas vazias quando não há amostras', () => {
    expect(summarizeSamples([], 'boot')).toEqual({ samples: 0, p50: null, p95: null, last: null });
  });

  it('calcula p50/p95 por posto e ignora outras métricas', () => {
    const samples = [100, 200, 300, 400, 500].map(ms => sample('push', ms));
    samples.push(sample('boot', 9999));
    const summary = summarizeSamples(samples, 'push');
    expect(summary.samples).toBe(5);
    expect(summary.p50).toBe(300);
    expect(summary.p95).toBe(500);
    expect(summary.last).toBe(500);
  });

  it('mantém as quatro métricas de F0 no contrato', () => {
    expect(PERF_METRICS).toEqual(['boot', 'pull.full', 'pull.delta', 'push']);
  });
});
