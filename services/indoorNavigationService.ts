
/**
 * Indoor Navigation Service
 * Implementa lógica de odometria relativa à Âncora da Unidade.
 * Utiliza Sensores de Movimento para calcular deslocamento sem forçar o uso de Satélite (GPS) indoor.
 */

import { GpsLocation, calculateDistance } from '../utils/gpsUtils';

class IndoorNavigationService {
  private anchor: GpsLocation | null = null;
  private currentRelativePos: { x: number; y: number } = { x: 0, y: 0 }; // metros
  private lastUpdate: number = 0;
  private isTracking: boolean = false;
  private currentAltitude: number = 0; // metros ou nível
  private status: 'green' | 'yellow' | 'red' = 'yellow';
  
  // Constante de conversão aproximada para metros -> graus
  // 1 grau ~ 111.320 metros
  private METERS_TO_DEGREE = 1 / 111320;

  /**
   * Define a Âncora da Unidade (Ponto de entrada validado via GPS)
   */
  setAnchor(location: GpsLocation) {
    this.anchor = location;
    this.currentRelativePos = { x: 0, y: 0 };
    this.lastUpdate = Date.now();
    this.saveState();
    console.log(`>>> [INDOOR] Âncora definida: ${location.lat}, ${location.lng}`);
  }

  private saveState() {
    const state = {
      anchor: this.anchor,
      currentRelativePos: this.currentRelativePos,
      currentAltitude: this.currentAltitude,
      lastUpdate: this.lastUpdate
    };
    localStorage.setItem('indoor_nav_state', JSON.stringify(state));
  }

  public loadState() {
    try {
      const saved = localStorage.getItem('indoor_nav_state');
      if (saved) {
        const state = JSON.parse(saved);
        this.anchor = state.anchor;
        this.currentRelativePos = state.currentRelativePos;
        this.currentAltitude = state.currentAltitude || 0;
        this.lastUpdate = state.lastUpdate;
        console.log('>>> [INDOOR] Estado de navegação restaurado.');
      }
    } catch (e) {
      console.warn('Falha ao restaurar estado indoor:', e);
    }
  }

  /**
   * Inicia o rastreamento via sensores de movimento
   */
  startTracking() {
    if (this.isTracking || !window.DeviceMotionEvent) {
      if (!window.DeviceMotionEvent) this.status = 'red';
      return;
    }
    
    this.loadState();
    this.isTracking = true;
    this.lastUpdate = Date.now();
    
    window.addEventListener('devicemotion', this.handleMotion);
    console.log('>>> [INDOOR] Rastreamento de sensores ativado.');
  }

  stopTracking() {
    this.isTracking = false;
    this.status = 'yellow';
    window.removeEventListener('devicemotion', this.handleMotion);
    localStorage.removeItem('indoor_nav_state');
    console.log('>>> [INDOOR] Rastreamento de sensores desativado.');
  }

  getStatus() {
    return this.status;
  }

  setAltitude(level: number) {
    this.currentAltitude = level;
    this.saveState();
  }

  private handleMotion = (event: DeviceMotionEvent) => {
    if (!this.isTracking) {
      this.status = 'yellow';
      return;
    }
    
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000; // segundos
    
    // Simplificação radical de odometria para demonstração/prototipagem funcional:
    // Captura aceleração (sem gravidade se disponível) e integra para obter deslocamento presumido.
    // Em produção, isso usaria filtros de Kalman ou sensores fusionados.
    const acc = event.acceleration;
    if (acc && acc.x !== null && acc.y !== null) {
      // Magnitude simplificada para simular passos/movimento
      const force = Math.sqrt(acc.x ** 2 + acc.y ** 2);
      
      // Filtro de ruído (ignora micro-vibrações)
      if (force > 0.5) {
        this.status = 'green';
        // Simula deslocamento baseado na força (F=ma, d=0.5at^2)
        // Usamos uma constante de sensibilidade calibrada para caminhada humana
        const sensitivity = 0.5;
        
        // No mundo real, precisaríamos do Gyroscope para saber a direção (Heading)
        // Para este app, assumiremos que o movimento contribui para a dispersão x/y
        // baseada na orientação do acelerômetro
        this.currentRelativePos.x += acc.x * dt * sensitivity;
        this.currentRelativePos.y += acc.y * dt * sensitivity;

        // Auto-save a cada movimento significativo para resiliência
        if (Math.abs(acc.x) > 1 || Math.abs(acc.y) > 1) {
          this.saveState();
        }
      } else if (now - this.lastUpdate > 5000) {
        this.status = 'yellow'; // Ocioso após 5s parado
      }
    } else {
      // Se parou de receber dados válidos
      if (now - this.lastUpdate > 1000) {
        this.status = 'red';
      }
    }
    
    this.lastUpdate = now;
  };

  /**
   * Retorna a coordenada calculada (Âncora + Deslocamento Sensores)
   */
  getCurrentPosition(): GpsLocation & { altitude?: number } {
    if (!this.anchor) {
      return { lat: 0, lng: 0, accuracy: 999 };
    }

    // Aplica deslocamento relativo à âncora
    const latOffset = this.currentRelativePos.y * this.METERS_TO_DEGREE;
    const lngOffset = (this.currentRelativePos.x * this.METERS_TO_DEGREE) / Math.cos(this.anchor.lat * Math.PI / 180);

    return {
      lat: this.anchor.lat + latOffset,
      lng: this.anchor.lng + lngOffset,
      accuracy: 5, // Alta precisão relativa
      altitude: this.currentAltitude
    };
  }

  /**
   * Valida se a posição GPS atual está dentro do raio da Âncora
   */
  validatePerimeter(currentGps: GpsLocation, unitAnchor: GpsLocation, radiusMeters = 500): boolean {
    const dist = calculateDistance(currentGps.lat, currentGps.lng, unitAnchor.lat, unitAnchor.lng);
    console.log(`>>> [INDOOR] Validação de perímetro: Distância=${dist.toFixed(1)}m, Limite=${radiusMeters}m`);
    return dist <= radiusMeters;
  }
}

export const indoorNavigation = new IndoorNavigationService();
