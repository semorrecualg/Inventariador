// @vitest-environment jsdom
// O scanner só confirma a leitura depois de o banco aceitar a gravação. Uma
// falha de persistência (Dexie cheio, tabela bloqueada) era engolida pelo
// `catch` do callback, que só escrevia no log — a câmara continuava, sem
// apitar e sem dizer nada, e o operador seguia com o item por gravar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import Scanner from '../components/Scanner';
import { ScannerMode } from '../types';

const fake = vi.hoisted(() => ({
  callbacks: [] as ((text: string) => Promise<void> | void)[]
}));

vi.mock('html5-qrcode', () => {
  class FakeHtml5Qrcode {
    static getCameras = vi.fn(async () => []);

    start = vi.fn(async (_camera: unknown, _config: unknown, onSuccess: (text: string) => Promise<void> | void) => {
      fake.callbacks.push(onSuccess);
    });

    stop = vi.fn(async () => {});
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

const flush = async (ms = 1500) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const scan = async (text: string) => {
  const onScanSuccess = fake.callbacks[fake.callbacks.length - 1];
  await act(async () => {
    await onScanSuccess(text);
    await vi.advanceTimersByTimeAsync(10);
  });
};

beforeEach(() => {
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

describe('Scanner — leitura gravada vs leitura recusada', () => {
  it('avisa «lido mas NÃO gravado» e não confirma sucesso quando o banco recusa', async () => {
    const onScan = vi.fn(async () => {
      throw new Error('QuotaExceededError: a base local está cheia');
    });

    render(<Scanner mode={ScannerMode.BARCODE} onScan={onScan} onClose={vi.fn()} />);
    await flush();

    await scan('7891234567890');

    expect(screen.getByText('Código lido — NÃO gravado')).toBeTruthy();
    expect(screen.getByText(/QuotaExceededError/)).toBeTruthy();
    expect(screen.queryByText('Lido!')).toBeNull();
    expect(document.getElementById('scanner-save-failure-flash')).not.toBeNull();
  });

  it('confirma a leitura quando a gravação passa', async () => {
    const onScan = vi.fn(async () => {});

    render(<Scanner mode={ScannerMode.BARCODE} onScan={onScan} onClose={vi.fn()} />);
    await flush();

    await scan('7891234567890');

    expect(onScan).toHaveBeenCalledWith('7891234567890');
    expect(screen.getByText('Lido!')).toBeTruthy();
    expect(screen.queryByText('Código lido — NÃO gravado')).toBeNull();
    expect(document.getElementById('scanner-save-failure-flash')).toBeNull();
  });

  it('deixa reler o mesmo código de imediato depois de uma falha', async () => {
    const onScan = vi.fn(async () => {
      throw new Error('falha transitória');
    });

    render(<Scanner mode={ScannerMode.BARCODE} onScan={onScan} onClose={vi.fn()} />);
    await flush();

    await scan('7891234567890');
    await scan('7891234567890');

    // A janela de guarda seria 2 s; uma falha de gravação não pode impedir a
    // nova tentativa, senão o item fica por gravar até o operador se afastar.
    expect(onScan).toHaveBeenCalledTimes(2);
  });
});
