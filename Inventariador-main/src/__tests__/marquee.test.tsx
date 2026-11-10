// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import Marquee from '../components/Marquee';
import { useDeviceMetrics } from '../hooks/useDeviceMetrics';

vi.mock('../services/telemetryService', () => ({
  telemetryService: {
    getDeviceMetrics: vi.fn().mockResolvedValue({ temp: 41, battery: 77 }),
    logTelemetry: vi.fn()
  }
}));

import { telemetryService } from '../services/telemetryService';

afterEach(() => {
  vi.useRealTimers();
});

describe('Marquee', () => {
  it('duplica o conteúdo e esconde a cópia extra dos leitores de ecrã', () => {
    const { container } = render(<Marquee>TELEMETRIA 38°C</Marquee>);

    const copies = container.querySelectorAll('.marquee-track > span');
    expect(copies).toHaveLength(2);
    expect(copies[0].getAttribute('aria-hidden')).toBeNull();
    expect(copies[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('mostra o texto do cabeçalho', () => {
    render(<Marquee>Bypass Liberado</Marquee>);
    expect(screen.getAllByText('Bypass Liberado').length).toBeGreaterThan(0);
  });
});

describe('useDeviceMetrics', () => {
  const Probe: React.FC<{ id: string }> = ({ id }) => {
    const metrics = useDeviceMetrics();
    return <span data-testid={id}>{`${metrics.temp}|${metrics.battery}`}</span>;
  };

  it('partilha um único poller entre os consumidores', async () => {
    vi.useFakeTimers();

    const view = render(
      <>
        <Probe id="inventario" />
        <Probe id="cabecalho" />
      </>
    );

    await act(async () => {});
    expect(screen.getByTestId('inventario').textContent).toBe('41|77');
    expect(screen.getByTestId('cabecalho').textContent).toBe('41|77');
    expect(telemetryService.getDeviceMetrics).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(telemetryService.getDeviceMetrics).toHaveBeenCalledTimes(2);

    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(telemetryService.getDeviceMetrics).toHaveBeenCalledTimes(2);
  });
});
