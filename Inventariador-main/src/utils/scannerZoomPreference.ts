import { ScannerMode } from '../types';

/**
 * Preferência de zoom do leitor, por modo.
 *
 * Foi reportado como «cliquei e não vi efeito nenhum»: parte do problema era o
 * zoom digital não existir na WebView, mas o factor escolhido também não
 * sobrevivia a um reinício da câmara (standby térmico, troca de câmara,
 * remount). O auditor punha 2x, encostava o telemóvel e voltava a 1x — um zoom
 * que se perde sozinho continua a parecer avariado mesmo estando correcto.
 *
 * Barras e QR têm preferências separadas: um 2x útil num código 1D não é o
 * mesmo enquadramento para um QR.
 */
export const SCANNER_ZOOM_STORAGE_KEY = 'gbr_scanner_zoom';

type StoredZoomFactors = { barcode?: number; qr?: number };

const slotFor = (mode: ScannerMode): keyof StoredZoomFactors =>
  mode === ScannerMode.QRCODE ? 'qr' : 'barcode';

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // WebView com storage bloqueado: o zoom continua a funcionar na sessão.
    return null;
  }
};

const readStored = (storage: Storage): StoredZoomFactors => {
  try {
    return JSON.parse(storage.getItem(SCANNER_ZOOM_STORAGE_KEY) || '{}') as StoredZoomFactors;
  } catch {
    // Conteúdo corrompido ou storage bloqueado: recomeça do zero em vez de
    // impedir a gravação do próximo factor.
    return {};
  }
};

/** Factor guardado para o modo (1x = mínimo), ou `null` se nunca foi escolhido. */
export const loadScannerZoomFactor = (mode: ScannerMode): number | null => {
  const storage = safeStorage();
  if (!storage) return null;
  const factor = Number(readStored(storage)[slotFor(mode)]);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
};

/** Guarda o factor escolhido para o modo. Nunca rebenta o scanner. */
export const saveScannerZoomFactor = (mode: ScannerMode, factor: number): void => {
  const storage = safeStorage();
  if (!storage || !Number.isFinite(factor) || factor <= 0) return;
  try {
    const raw = readStored(storage);
    storage.setItem(SCANNER_ZOOM_STORAGE_KEY, JSON.stringify({ ...raw, [slotFor(mode)]: factor }));
  } catch {
    // Sem persistência, o zoom escolhido continua válido para esta sessão.
  }
};
