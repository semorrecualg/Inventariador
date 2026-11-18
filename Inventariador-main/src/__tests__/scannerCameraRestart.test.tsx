// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import Scanner from '../components/Scanner';
import { ScannerMode } from '../types';

// O scanner fala com o html5-qrcode e com o hardware: aqui só interessam as
// chamadas a `start`/`stop` da câmara e o callback de leitura.
const fake = vi.hoisted(() => ({
  starts: [] as { camera: unknown; config: unknown }[],
  stops: 0,
  callbacks: [] as ((text: string) => Promise<void> | void)[]
}));

vi.mock('html5-qrcode', () => {
  class FakeHtml5Qrcode {
    static getCameras = vi.fn(async () => []);

    start = vi.fn(async (camera: unknown, config: unknown, onSuccess: (text: string) => Promise<void> | void) => {
      fake.starts.push({ camera, config });
      fake.callbacks.push(onSuccess);
    });

    stop = vi.fn(async () => {
      fake.stops += 1;
    });
  }

  return {
    Html5Qrcode: FakeHtml5Qrcode,
    Html5QrcodeSupportedFormats: {
      QR_CODE: 0,
      CODE_128: 1,
      EAN_13: 2,
      EAN_8: 3,
      CODE_39: 4,
      UPC_A: 5,
      UPC_E: 6
    }
  };
});

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../utils/scanFeedback', () => ({ playScanFeedback: vi.fn() }));

type OnScan = (result: string) => Promise<void> | void;

const scanner = (onScan: OnScan, batterySaver = false) => (
  <Scanner
    mode={ScannerMode.BARCODE}
    onScan={onScan}
    onClose={vi.fn()}
    batterySaver={batterySaver}
  />
);

// O arranque tem esperas reais (500 ms antes de instanciar, 400 ms para ler as
// capacidades do track) e o stop tem 300 ms para libertar o hardware.
const flush = async (ms = 1500) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  fake.starts.length = 0;
  fake.stops = 0;
  fake.callbacks.length = 0;
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Scanner — ciclo de vida da câmara', () => {
  it('não reinicia a câmara quando o onScan muda de identidade', async () => {
    const { rerender } = render(scanner(vi.fn(async () => {})));
    await flush();

    expect(fake.starts).toHaveLength(1);
    expect(fake.stops).toBe(0);

    // É isto que o inventário faz: um `handleScan` novo a cada alteração de
    // estado (cooldown, persistência, lanterna...). Antes, cada identidade
    // recriava `startScanner` e o efeito parava e reabria a câmara.
    for (let i = 0; i < 3; i += 1) {
      rerender(scanner(vi.fn(async () => {})));
      await flush(50);
    }

    expect(fake.starts).toHaveLength(1);
    expect(fake.stops).toBe(0);
  });

  it('entrega a leitura ao onScan mais recente sem reabrir a câmara', async () => {
    const primeiroOnScan = vi.fn(async () => {});
    const { rerender } = render(scanner(primeiroOnScan));
    await flush();

    const onScanAtual = vi.fn(async () => {});
    rerender(scanner(onScanAtual));
    await flush(50);

    const onScanSuccess = fake.callbacks[fake.callbacks.length - 1];
    await act(async () => {
      await onScanSuccess('7891234567890');
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(onScanAtual).toHaveBeenCalledWith('7891234567890');
    expect(primeiroOnScan).not.toHaveBeenCalled();
    expect(fake.starts).toHaveLength(1);
    expect(fake.stops).toBe(0);
  });

  it('reinicia a câmara quando muda o perfil de consumo', async () => {
    const onScan = vi.fn(async () => {});
    const { rerender } = render(scanner(onScan, false));
    await flush();

    expect(fake.starts).toHaveLength(1);

    rerender(scanner(onScan, true));
    await flush(2500);

    expect(fake.stops).toBe(1);
    expect(fake.starts).toHaveLength(2);
  });
});
