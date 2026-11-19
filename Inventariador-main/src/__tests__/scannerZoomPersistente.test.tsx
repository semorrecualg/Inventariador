// @vitest-environment jsdom
// src/__tests__/scannerZoomPersistente.test.tsx
// O scanner esquecia o zoom a cada arranque: `startScanner` removia o
// `--scanner-zoom` e repunha 1x. O auditor punha 2x, encostava o telemóvel, o
// standby térmico reiniciava a câmara — e o zoom desaparecia, o que continua a
// parecer «cliquei e não vi efeito nenhum». Estes testes fixam a reposição do
// factor guardado, por modo, em `initZoom`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import Scanner from '../components/Scanner';
import { ScannerMode } from '../types';
import { SCANNER_ZOOM_STORAGE_KEY } from '../utils/scannerZoomPreference';

const fake = vi.hoisted(() => ({
  callbacks: [] as ((text: string) => Promise<void> | void)[]
}));

vi.mock('html5-qrcode', () => {
  class FakeHtml5Qrcode {
    static getCameras = vi.fn(async () => []);
    // Região de leitura como o html5-qrcode 2.3.8 a expõe: sem ela o zoom
    // digital fica desactivado e o teste não provaria nada.
    qrRegion = { x: 0, y: 0, width: 350, height: 150 };

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

const makeTrack = (): MediaStreamTrack =>
  ({
    readyState: 'live',
    // Sem `zoom` nas capacidades: é o caminho da WebView Android,
    // que cai no zoom digital (CSS + região de leitura).
    getCapabilities: () => ({}),
    getSettings: () => ({}),
    applyConstraints: vi.fn(async () => {}),
    // O desmontar do Scanner pára o track guardado.
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }) as unknown as MediaStreamTrack;

/**
 * O html5-qrcode real injeta o `<video>` dentro de `#reader`; aqui é o teste
 * que o faz, com um track falso, e dá tamanho ao viewfinder (jsdom = 0).
 */
const attachVideo = (track: MediaStreamTrack) => {
  const reader = document.getElementById('reader');
  if (!reader) throw new Error('viewfinder ausente');
  const video = document.createElement('video');
  (video as HTMLVideoElement).srcObject = {
    getVideoTracks: () => [track]
  } as unknown as MediaStream;
  reader.appendChild(video);
  Object.defineProperty(reader, 'clientWidth', { value: 390, configurable: true });
  Object.defineProperty(reader, 'clientHeight', { value: 844, configurable: true });
  return reader;
};

const scanner = (mode: ScannerMode) => (
  <Scanner mode={mode} onScan={vi.fn(async () => {})} onClose={vi.fn()} />
);

const flush = async (ms = 1600) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const zoomCss = () =>
  document.getElementById('reader')?.style.getPropertyValue('--scanner-zoom');

beforeEach(() => {
  fake.callbacks.length = 0;
  localStorage.clear();
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Scanner — o zoom sobrevive ao reinício da câmara', () => {
  it('repõe no arranque o factor guardado para o modo barras', async () => {
    localStorage.setItem(SCANNER_ZOOM_STORAGE_KEY, JSON.stringify({ barcode: 2 }));

    render(scanner(ScannerMode.BARCODE));
    attachVideo(makeTrack());
    await flush();

    expect(zoomCss()).toBe('2');
  });

  it('cada modo repõe o seu próprio factor', async () => {
    localStorage.setItem(SCANNER_ZOOM_STORAGE_KEY, JSON.stringify({ barcode: 2, qr: 3 }));

    render(scanner(ScannerMode.QRCODE));
    attachVideo(makeTrack());
    await flush();

    expect(zoomCss()).toBe('3');
  });

  it('guarda o factor quando o auditor toca em aumentar zoom', async () => {
    render(scanner(ScannerMode.BARCODE));
    attachVideo(makeTrack());
    await flush();

    expect(zoomCss()).toBe('1');

    fireEvent.click(document.querySelector('button[aria-label="Aumentar zoom"]') as HTMLButtonElement);

    expect(zoomCss()).toBe('1.5');
    expect(JSON.parse(localStorage.getItem(SCANNER_ZOOM_STORAGE_KEY) || '{}')).toMatchObject({
      barcode: 1.5
    });
  });
});
