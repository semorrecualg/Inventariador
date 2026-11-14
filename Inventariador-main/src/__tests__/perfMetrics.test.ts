import { describe, it, expect } from 'vitest';
import { summarizeSamples, formatPerfBaseline, normalizePerfBaseline, PERF_METRICS, type PerfSample } from '../utils/perfMetrics';

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

  it('formata o snapshot em JSON legível, com trigger e espelhos', () => {
    const text = formatPerfBaseline({
      at: '2026-11-14T12:00:00.000Z',
      trigger: 'pull.full',
      tenantid: 'CICOPAL',
      mirrors: { local_assets: 12636, ativos: 12636, assets: 12636, total: 12636 },
      metrics: {
        boot: { samples: 1, p50: 900, p95: 900, last: 900 },
        'pull.full': { samples: 1, p50: 1200, p95: 1200, last: 1200 },
        'pull.delta': { samples: 0, p50: null, p95: null, last: null },
        push: { samples: 0, p50: null, p95: null, last: null }
      }
    });
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.trigger).toBe('pull.full');
    expect(parsed.tenantid).toBe('CICOPAL');
    expect((parsed.mirrors as Record<string, number>).local_assets).toBe(12636);
  });

  it('lê snapshot antigo sem trigger como manual', () => {
    const legacy = {
      at: '2026-11-01T08:00:00.000Z',
      tenantid: 'CICOPAL',
      mirrors: { local_assets: 12636, ativos: 12636, assets: 12636, total: 12636 },
      metrics: {
        boot: { samples: 1, p50: 800, p95: 800, last: 800 },
        'pull.full': { samples: 0, p50: null, p95: null, last: null },
        'pull.delta': { samples: 0, p50: null, p95: null, last: null },
        push: { samples: 0, p50: null, p95: null, last: null }
      }
    };
    const normalized = normalizePerfBaseline(legacy);
    expect(normalized?.trigger).toBe('manual');
    expect(normalized?.mirrors?.total).toBe(12636);
  });

  it('normaliza trigger desconhecido e rejeita snapshot sem forma válida', () => {
    expect(normalizePerfBaseline({ at: 'x', trigger: 'antigo', metrics: {} })?.trigger).toBe('manual');
    expect(normalizePerfBaseline({ at: 'x' })).toBeNull();
    expect(normalizePerfBaseline(null)).toBeNull();
    expect(normalizePerfBaseline('texto')).toBeNull();
  });
});
