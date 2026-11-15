// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  readFieldPreferences,
  writeFieldPreferences,
  stripDevicePreferences
} from '../utils/fieldPreferences';
import { DEVICE_CONFIG_KEYS } from '../utils/configScope';
import { ScannerMode, ScanFeedbackMode } from '../types';

/**
 * Ajustes de Campo têm UMA fonte de verdade: o localStorage do dispositivo.
 * O snapshot do inventário (SQLite, cache, nuvem) não carrega estas chaves —
 * antes carregava, e ao arrancar o snapshot podia desfazer o ajuste.
 */
describe('fieldPreferences — fonte única do dispositivo', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('sem nada gravado, devolve os padrões', () => {
    expect(readFieldPreferences()).toEqual({
      scannerMode: ScannerMode.BARCODE,
      autoConfirmOnScan: true,
      scanFeedbackMode: ScanFeedbackMode.BOTH,
      darkMode: false,
      batterySaver: false
    });
  });

  it('grava e relê o que o usuário escolheu', () => {
    writeFieldPreferences({
      scannerMode: ScannerMode.QRCODE,
      autoConfirmOnScan: false,
      scanFeedbackMode: ScanFeedbackMode.NONE,
      darkMode: true,
      batterySaver: true
    });

    expect(readFieldPreferences()).toEqual({
      scannerMode: ScannerMode.QRCODE,
      autoConfirmOnScan: false,
      scanFeedbackMode: ScanFeedbackMode.NONE,
      darkMode: true,
      batterySaver: true
    });
  });

  it('ignora valores inválidos no storage em vez de quebrar a UI', () => {
    localStorage.setItem('app_scanner_mode', 'LASER');
    localStorage.setItem('app_scan_feedback_mode', 'BIP_LONGO');

    const prefs = readFieldPreferences();
    expect(prefs.scannerMode).toBe(ScannerMode.BARCODE);
    expect(prefs.scanFeedbackMode).toBe(ScanFeedbackMode.BOTH);
  });

  it('snapshot perde as cinco preferências e mantém o resto', () => {
    const snapshot: Record<string, unknown> = {
      darkMode: true,
      batterySaver: true,
      scannerMode: ScannerMode.QRCODE,
      autoConfirmOnScan: false,
      scanFeedbackMode: ScanFeedbackMode.SOUND,
      editableFields: ['SERIAL'],
      lastUpdated: '2026-11-15T00:00:00.000Z'
    };

    const stripped = stripDevicePreferences(snapshot);

    DEVICE_CONFIG_KEYS.forEach((field) => expect(stripped).not.toHaveProperty(field));
    expect(stripped.editableFields).toEqual(['SERIAL']);
    expect(stripped.lastUpdated).toBe('2026-11-15T00:00:00.000Z');
  });
});
