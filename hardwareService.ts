// GBR v24.50 KARDEK - MÓDULO SOBERANO DE SEGURANÇA DE HARDWARE
import { Device } from '@capacitor/device';

export interface BatteryState {
  batteryLevel: number;
  isCharging: boolean;
}

/**
 * Recupera o estado atual de energia do dispositivo móvel.
 * Trata falhas nativas preventivamente com coalescência de nulos.
 */
export async function getDeviceBatteryState(): Promise<BatteryState> {
  try {
    const info = await Device.getBatteryInfo();
    return {
      batteryLevel: info.batteryLevel ?? 0,
      isCharging: info.isCharging ?? false,
    };
  } catch {
    // Failsafe: Em caso de estouro de memória ou falha na WebView, assume o pior cenário
    return { batteryLevel: 0, isCharging: false };
  }
}

/**
 * REGRA RIGIDA DE HARDWARE: Impede gravações se a bateria for < 5% sem fonte externa conectado.
 * Retorna true se a escrita for AUTORIZADA, ou lança um erro fatal se for REJEITADA.
 */
export async function validateHardwareSafetyForWrite(): Promise<boolean> {
  const state = await getDeviceBatteryState();

  // Transformação para porcentagem inteira para evitar erros de ponto flutuante
  const currentPercentage = Math.round(state.batteryLevel * 100);

  if (currentPercentage < 5 && !state.isCharging) {
    throw new Error(
      `CRITICAL_HARDWARE_FAILURE: Gravação em lote abortada. Bateria em ${currentPercentage}% sem alimentação externa.`
    );
  }

  return true;
}
