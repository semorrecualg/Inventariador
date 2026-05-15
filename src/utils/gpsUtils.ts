
import { Geolocation } from '@capacitor/geolocation';

/**
 * Utilitário para captura de geolocalização (GPS)
 */

export interface GpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

let lastLocation: GpsLocation | null = null;
let lastTimestamp: number = 0;
let watchId: string | null = null;

/**
 * Inicia o rastreamento autônomo em segundo plano
 */
export const startAutonomousTracking = async () => {
  if (watchId !== null) return;

  console.log('Iniciando Rastreamento Autônomo (Capacitor/Web)...');
  
  try {
    watchId = await Geolocation.watchPosition(
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000
      },
      (position, err) => {
        if (err) {
          console.warn('Autônomo: Erro no rastreio', err.message);
          return;
        }
        if (position) {
          lastLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          lastTimestamp = Date.now();
        }
      }
    );
  } catch (e) {
    console.error('Falha ao iniciar watchPosition:', e);
  }
};

/**
 * Para o rastreamento autônomo
 */
export const stopAutonomousTracking = async () => {
  if (watchId !== null) {
    await Geolocation.clearWatch({ id: watchId });
    watchId = null;
    console.log('Rastreamento Autônomo Finalizado.');
  }
};

export const getCurrentLocation = async (forceRefresh = false): Promise<GpsLocation> => {
  const now = Date.now();
  
  // Retorna cache se for recente (30 segundos) e não for forçado
  if (!forceRefresh && lastLocation && (now - lastTimestamp < 30000)) {
    return lastLocation;
  }

  try {
    // Tenta Capacitor (Nativo) primeiro
    const coordinates = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000
    });

    if (coordinates && coordinates.coords) {
      const newLoc = {
        lat: coordinates.coords.latitude,
        lng: coordinates.coords.longitude,
        accuracy: coordinates.coords.accuracy
      };
      lastLocation = newLoc;
      lastTimestamp = Date.now();
      return newLoc;
    }
  } catch (err) {
    console.warn('>>> [GPS] Falha no Geolocation.getCurrentPosition Nativo, tentando Web API...', err);
  }

  // Fallback para Web Geolocation API
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        lastLocation = newLoc;
        lastTimestamp = Date.now();
        resolve(newLoc);
      },
      (err) => {
        let msg = 'Erro ao obter localização.';
        if (err.code === err.PERMISSION_DENIED) msg = 'Permissão negada.';
        if (lastLocation) {
          resolve(lastLocation);
        } else {
          reject(new Error(msg));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
};

/**
 * Calcula a distância entre dois pontos em metros usando a fórmula de Haversine
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
