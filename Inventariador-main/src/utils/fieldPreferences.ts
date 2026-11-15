// ============================================================================
// fieldPreferences — AJUSTES DE CAMPO (fonte única)
// ----------------------------------------------------------------------------
// Estas preferências são do DISPOSITIVO, não do inventário: descrevem como a
// câmara, o bip, o tema e o modo de busca se comportam naquele aparelho. Por
// isso vivem só no localStorage e são removidas do snapshot do inventário
// (cache local e nuvem) — antes eram gravadas nos dois sítios e o snapshot, ao
// carregar, podia ganhar e desfazer o ajuste que o usuário acabou de fazer.
//
// O escopo (que chaves são do dispositivo) é declarado UMA vez, em
// utils/configScope. Aqui só se decide onde e como cada uma é guardada.
// `databaseMode` pertence ao escopo de dispositivo mas NÃO vive aqui: tem ciclo
// de vida próprio e é persistido em `app_database_mode`.
// ============================================================================

import { ScannerMode, ScanFeedbackMode, InventorySearchMode, InventoryState } from '../types';
import { DEVICE_CONFIG_KEYS, DEVICE_PREFERENCE_KEYS } from './configScope';

/** Escopo declarado uma única vez em utils/configScope. */
export type FieldPreferences = Pick<
  InventoryState,
  (typeof DEVICE_PREFERENCE_KEYS)[number]
>;

const KEYS: Record<keyof FieldPreferences, string> = {
  scannerMode: 'app_scanner_mode',
  autoConfirmOnScan: 'app_auto_confirm_on_scan',
  scanFeedbackMode: 'app_scan_feedback_mode',
  darkMode: 'app_dark_mode',
  batterySaver: 'app_battery_saver',
  inventorySearchMode: 'app_inventory_search_mode',
  immersiveMode: 'app_immersive_mode'
};

const DEFAULT_PREFERENCES: Required<FieldPreferences> = {
  scannerMode: ScannerMode.BARCODE,
  autoConfirmOnScan: true,
  scanFeedbackMode: ScanFeedbackMode.BOTH,
  darkMode: false,
  batterySaver: false,
  inventorySearchMode: InventorySearchMode.MANUAL,
  immersiveMode: false
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

const isSearchMode = (value: unknown): value is InventorySearchMode =>
  value === InventorySearchMode.MANUAL || value === InventorySearchMode.SCANNER;

/** Lê as preferências do dispositivo, ignorando valores inválidos no storage. */
export function readFieldPreferences(): Required<FieldPreferences> {
  const scannerMode = safeGet(KEYS.scannerMode);
  const scanFeedbackMode = safeGet(KEYS.scanFeedbackMode);
  const inventorySearchMode = safeGet(KEYS.inventorySearchMode);
  const autoConfirm = safeGet(KEYS.autoConfirmOnScan);

  return {
    scannerMode: isScannerMode(scannerMode) ? scannerMode : DEFAULT_PREFERENCES.scannerMode,
    autoConfirmOnScan: autoConfirm === null ? DEFAULT_PREFERENCES.autoConfirmOnScan : autoConfirm !== 'false',
    scanFeedbackMode: isFeedbackMode(scanFeedbackMode) ? scanFeedbackMode : DEFAULT_PREFERENCES.scanFeedbackMode,
    darkMode: safeGet(KEYS.darkMode) === 'true',
    batterySaver: safeGet(KEYS.batterySaver) === 'true',
    inventorySearchMode: isSearchMode(inventorySearchMode)
      ? inventorySearchMode
      : DEFAULT_PREFERENCES.inventorySearchMode,
    immersiveMode: safeGet(KEYS.immersiveMode) === 'true'
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
    if (prefs.inventorySearchMode) {
      localStorage.setItem(KEYS.inventorySearchMode, String(prefs.inventorySearchMode));
    }
    if (prefs.immersiveMode !== undefined) {
      localStorage.setItem(KEYS.immersiveMode, String(!!prefs.immersiveMode));
    }
  } catch {
    /* storage indisponível: mantém-se só a sessão */
  }
}

/**
 * Migração única: snapshots gravados antes desta separação ainda trazem as
 * preferências de dispositivo. O que o aparelho não tiver no localStorage é
 * adoptado do snapshot (uma vez), em vez de se perder ao aplicar o localStorage
 * por cima no arranque.
 */
export function migrateDevicePreferencesFromSnapshot(
  snapshot: Partial<InventoryState> | null | undefined
): void {
  if (!snapshot) return;

  const updates: Partial<FieldPreferences> = {};

  if (safeGet(KEYS.scannerMode) === null && isScannerMode(snapshot.scannerMode)) {
    updates.scannerMode = snapshot.scannerMode;
  }
  if (safeGet(KEYS.autoConfirmOnScan) === null && typeof snapshot.autoConfirmOnScan === 'boolean') {
    updates.autoConfirmOnScan = snapshot.autoConfirmOnScan;
  }
  if (safeGet(KEYS.scanFeedbackMode) === null && isFeedbackMode(snapshot.scanFeedbackMode)) {
    updates.scanFeedbackMode = snapshot.scanFeedbackMode;
  }
  if (safeGet(KEYS.darkMode) === null && typeof snapshot.darkMode === 'boolean') {
    updates.darkMode = snapshot.darkMode;
  }
  if (safeGet(KEYS.batterySaver) === null && typeof snapshot.batterySaver === 'boolean') {
    updates.batterySaver = snapshot.batterySaver;
  }
  if (safeGet(KEYS.inventorySearchMode) === null && isSearchMode(snapshot.inventorySearchMode)) {
    updates.inventorySearchMode = snapshot.inventorySearchMode;
  }
  if (safeGet(KEYS.immersiveMode) === null && typeof snapshot.immersiveMode === 'boolean') {
    updates.immersiveMode = snapshot.immersiveMode;
  }

  if (Object.keys(updates).length > 0) writeFieldPreferences(updates);
}

/**
 * Remove as preferências de dispositivo de um snapshot antes de o gravar.
 * Devolve o mesmo objeto (mutável) para não duplicar memória com ativos grandes.
 */
export function stripDevicePreferences<T extends Record<string, unknown>>(snapshot: T): T {
  DEVICE_CONFIG_KEYS.forEach((field) => {
    delete snapshot[field];
  });
  return snapshot;
}
