import { useEffect, useState } from 'react';
import { telemetryService, DeviceMetrics } from '../services/telemetryService';

/**
 * Métricas de hardware (temperatura/bateria) partilhadas por toda a app.
 *
 * O painel de inventário precisa delas para a regra térmica (CPC 27) e a faixa
 * do cabeçalho para as mostrar. Em vez de cada componente abrir o seu próprio
 * timer de 5 s, existe um único poller a nível de módulo, iniciado pelo primeiro
 * subscritor e parado quando o último sai.
 */

const DEFAULT_METRICS: DeviceMetrics = { temp: 35, battery: 100 };
const POLL_INTERVAL_MS = 5000;

let latest: DeviceMetrics = DEFAULT_METRICS;
const listeners = new Set<(metrics: DeviceMetrics) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function poll(): Promise<void> {
  const metrics = await telemetryService.getDeviceMetrics();
  latest = metrics;
  listeners.forEach((listener) => listener(metrics));
}

function subscribe(listener: (metrics: DeviceMetrics) => void): () => void {
  listeners.add(listener);
  if (!timer) {
    void poll();
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Devolve as métricas atuais, atualizadas a cada 5 s. */
export function useDeviceMetrics(): DeviceMetrics {
  const [metrics, setMetrics] = useState<DeviceMetrics>(latest);

  useEffect(() => subscribe(setMetrics), []);

  return metrics;
}

export default useDeviceMetrics;
