import { supabase } from './supabaseService';

export interface DeviceMetrics {
  temp: number;
  battery: number;
}

class TelemetryService {
  private scanCount: number = 0;
  private lastLoggedTemp: number | null = null;
  private lastLoggedBattery: number | null = null;
  private batchBuffer: unknown[] = [];

  /**
   * Obtém métricas do dispositivo.
   * Em React Native, isso chamaria o NativeModule.
   * No ambiente web, usamos a Battery API como fallback.
   */
  async getDeviceMetrics(): Promise<DeviceMetrics> {
    try {
      // Simulação do NativeModule Android
      // @ts-expect-error - Simulação de ambiente nativo
      if ((window as unknown as { ThermalModule?: { getDeviceMetrics: () => Promise<DeviceMetrics> } }).ThermalModule) {
        // @ts-expect-error - Simulação de ambiente nativo
        return await (window as unknown as { ThermalModule: { getDeviceMetrics: () => Promise<DeviceMetrics> } }).ThermalModule.getDeviceMetrics();
      }

      // Fallback Web API
      let batteryLevel = 100;
      if ('getBattery' in navigator) {
        // @ts-expect-error - Battery API experimental
        const battery = await (navigator as unknown as { getBattery: () => Promise<{ level: number }> }).getBattery();
        batteryLevel = Math.round(battery.level * 100);
      }

      // Temperatura simulada para o preview (entre 35 e 42 graus)
      const simulatedTemp = 35 + Math.random() * 7;

      return {
        temp: parseFloat(simulatedTemp.toFixed(1)),
        battery: batteryLevel
      };
    } catch (error) {
      console.error('Erro ao obter métricas do dispositivo:', error);
      return { temp: 38.0, battery: 100 };
    }
  }

  /**
   * Registra telemetria com lógica de throttle.
   * Envia apenas se:
   * 1. 5 novas leituras realizadas.
   * 2. Variação de temperatura > 2°C.
   * 3. Queda de bateria > 5%.
   */
  async logTelemetry(userId: string, tag: string | null, torchActive: boolean = false) {
    const metrics = await this.getDeviceMetrics();
    this.scanCount++;

    const shouldLog = 
      this.scanCount >= 5 || 
      (this.lastLoggedTemp !== null && Math.abs(metrics.temp - this.lastLoggedTemp) > 2) ||
      (this.lastLoggedBattery !== null && (this.lastLoggedBattery - metrics.battery) > 5) ||
      this.lastLoggedTemp === null;

    if (shouldLog) {
      await this.persistLog(userId, tag, metrics, torchActive);
      this.scanCount = 0;
      this.lastLoggedTemp = metrics.temp;
      this.lastLoggedBattery = metrics.battery;
    }
  }

  private async persistLog(userId: string, tag: string | null, metrics: DeviceMetrics, torchActive: boolean) {
    try {
      const { error } = await supabase
        .from('log_inventario_termico')
        .insert({
          usuario_id: userId,
          ativo_tag: tag,
          temp_celsius: metrics.temp,
          bateria_nivel: metrics.battery,
          lanterna_ativa: torchActive,
          timestamp: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao persistir log térmico:', error);
    }
  }
}

export const telemetryService = new TelemetryService();
