// ============================================================================
// fieldPreferences — AJUSTES DE CAMPO (fonte única)
// ----------------------------------------------------------------------------
// Estas cinco preferências são do DISPOSITIVO, não do inventário: descrevem
// como a câmara, o bip e o tema se comportam naquele aparelho. Por isso vivem
// só no localStorage e são removidas do snapshot do inventário (SQLite, cache
// e nuvem) — antes eram gravadas nos dois sítios e o snapshot, ao carregar,
// podia ganhar e desfazer o ajuste que o usuário acabou de fazer.
// ============================================================================

import { ScannerMode, ScanFeedbackMode, InventoryState } from '../types';

export type FieldPreferences = Pick<
  InventoryState,
  'scannerMode' | 'autoConfirmOnScan' | 'scanFeedbackMode' | 'darkMode' | 'batterySaver'
>;

/** Campos que pertencem ao dispositivo; nunca seguem no snapshot. */
export const DEVICE_PREF_FIELDS = [
  'scannerMode',
  'autoConfirmOnScan',
  'scanFeedbackMode',
  'darkMode',
  'batterySaver'
] as const;

const KEYS = {
  scannerMode: 'app_scanner_mode',
  autoConfirmOnScan: 'app_auto_confirm_on_scan',
  scanFeedbackMode: 'app_scan_feedback_mode',
  darkMode: 'app_dark_mode',
  batterySaver: 'app_battery_saver'
} as const;

const DEFAULT_PREFERENCES: Required<FieldPreferences> = {
  scannerMode: ScannerMode.BARCODE,
  autoConfirmOnScan: true,
  scanFeedbackMode: ScanFeedbackMode.BOTH,
  darkMode: false,
  batterySaver: false
};

const safeGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const isScannerMode = (value: unknown): value is ScannerMode =>
  value === ScannerMode.BARCODE || value === ScannerMode.QRCODE;

const isFeedbackMode = (value: unknown): value is ScanFeedbackMode =>
  value === ScanFeedbackMode.VIBRATE ||
  value === ScanFeedbackMode.SOUND ||
  value === ScanFeedbackMode.BOTH ||
  value === ScanFeedbackMode.NONE;

/** Lê as preferências do dispositivo, ignorando valores inválidos no storage. */
export function readFieldPreferences(): Required<FieldPreferences> {
  const scannerMode = safeGet(KEYS.scannerMode);
  const scanFeedbackMode = safeGet(KEYS.scanFeedbackMode);
  const autoConfirm = safeGet(KEYS.autoConfirmOnScan);

  return {
    scannerMode: isScannerMode(scannerMode) ? scannerMode : DEFAULT_PREFERENCES.scannerMode,
    autoConfirmOnScan: autoConfirm === null ? DEFAULT_PREFERENCES.autoConfirmOnScan : autoConfirm !== 'false',
    scanFeedbackMode: isFeedbackMode(scanFeedbackMode) ? scanFeedbackMode : DEFAULT_PREFERENCES.scanFeedbackMode,
    darkMode: safeGet(KEYS.darkMode) === 'true',
    batterySaver: safeGet(KEYS.batterySaver) === 'true'
  };
}

/** Grava as preferências do dispositivo. Nunca lança (quota/modo privado). */
export function writeFieldPreferences(prefs: Partial<FieldPreferences>): void {
  try {
    if (prefs.scannerMode) localStorage.setItem(KEYS.scannerMode, String(prefs.scannerMode));
    if (prefs.autoConfirmOnScan !== undefined) {
      localStorage.setItem(KEYS.autoConfirmOnScan, String(prefs.autoConfirmOnScan !== false));
    }
    if (prefs.scanFeedbackMode) localStorage.setItem(KEYS.scanFeedbackMode, String(prefs.scanFeedbackMode));
    if (prefs.darkMode !== undefined) localStorage.setItem(KEYS.darkMode, String(!!prefs.darkMode));
    if (prefs.batterySaver !== undefined) {
      localStorage.setItem(KEYS.batterySaver, String(!!prefs.batterySaver));
    }
  } catch {
    /* storage indisponível: mantém-se só a sessão */
  }
}

/**
 * Remove as preferências de dispositivo de um snapshot antes de o gravar.
 * Devolve o mesmo objeto (mutável) para não duplicar memória com ativos grandes.
 */
export function stripDevicePreferences<T extends Record<string, unknown>>(snapshot: T): T {
  DEVICE_PREF_FIELDS.forEach((field) => {
    delete snapshot[field];
  });
  return snapshot;
}
