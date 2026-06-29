/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppScreen } from '../types';

let toastCallback: ((message: string, type: string) => void) | null = null;

export function registerToastCallback(cb: (message: string, type: string) => void) {
  toastCallback = cb;
}

export function showRecoveryToast(message: string, type: string = 'blue') {
  if (toastCallback) {
    toastCallback(message, type);
  } else if (typeof window !== 'undefined' && (window as any).showRecoveryToast) {
    (window as any).showRecoveryToast(message, type);
  } else {
    console.warn(`[SRE-GUARD] ${message}`);
  }
}

export function validateAndPushRoute(nextScreen: AppScreen, selectedUnit: string | null): AppScreen {
  const restrictedScreens = [AppScreen.DASHBOARD, AppScreen.ADDRESS_SELECTION, AppScreen.INVENTORY];
  
  if (restrictedScreens.includes(nextScreen) && !selectedUnit) {
    showRecoveryToast("⚠️ VIOLAÇÃO DE FLUXO: SELECIONE UMA FILIAL ATIVA.", "blue");
    return AppScreen.UNIT_SELECTION; // Força recuo imediato na esteira linear
  }
  
  return nextScreen;
}
