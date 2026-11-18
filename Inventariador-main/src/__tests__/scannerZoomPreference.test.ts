// @vitest-environment jsdom
// src/__tests__/scannerZoomPreference.test.ts
// O factor de zoom escolhido tem de sobreviver a um reinício da câmara e é
// guardado por modo: um 2x nas barras não é o enquadramento certo para o QR.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScannerMode } from '../types';
import {
  SCANNER_ZOOM_STORAGE_KEY,
  loadScannerZoomFactor,
  saveScannerZoomFactor
} from '../utils/scannerZoomPreference';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('preferência de zoom do scanner', () => {
  it('guarda o factor de cada modo sem os misturar', () => {
    saveScannerZoomFactor(ScannerMode.BARCODE, 2);
    saveScannerZoomFactor(ScannerMode.QRCODE, 1.5);

    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBe(2);
    expect(loadScannerZoomFactor(ScannerMode.QRCODE)).toBe(1.5);
  });

  it('não inventa factor quando nunca foi escolhido', () => {
    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBeNull();
    expect(loadScannerZoomFactor(ScannerMode.QRCODE)).toBeNull();
  });

  it('ignora storage corrompido sem rebentar', () => {
    localStorage.setItem(SCANNER_ZOOM_STORAGE_KEY, 'isto não é json');
    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBeNull();

    saveScannerZoomFactor(ScannerMode.BARCODE, 2);
    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBe(2);
  });

  it('recusa factores inválidos', () => {
    saveScannerZoomFactor(ScannerMode.BARCODE, Number.NaN);
    saveScannerZoomFactor(ScannerMode.BARCODE, 0);
    saveScannerZoomFactor(ScannerMode.BARCODE, -2);

    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBeNull();
  });

  it('devolve null e não lança quando o storage está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado');
    });

    expect(loadScannerZoomFactor(ScannerMode.BARCODE)).toBeNull();
    expect(() => saveScannerZoomFactor(ScannerMode.BARCODE, 2)).not.toThrow();
  });
});
