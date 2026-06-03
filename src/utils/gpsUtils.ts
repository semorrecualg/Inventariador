
import { Geolocation } from '@capacitor/geolocation';

/**
 * Utilitário para captura de geolocalização (GPS)
 */

export interface GeoLocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  isBypassed: boolean;
  source: 'native' | 'admin_bypass';
}

export async function getCurrentDeviceLocation(
  userRole: string,
  unitAnchorCoordinates?: { lat: number; lng: number }
): Promise<GeoLocationResult> {
  const isAdmin = ['ADMIN', 'MASTER', 'GESTOR'].includes((userRole || '').toUpperCase());

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    if (isAdmin && unitAnchorCoordinates) return getAdminFallback(unitAnchorCoordinates);
    throw new Error("Geolocalização indisponível.");
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      try {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        });
      } catch (err) {
        reject(err);
      }
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      isBypassed: false,
      source: 'native',
    };
  } catch (errorVal: unknown) {
    const error = errorVal as { code?: string | number; message?: string; name?: string } | null;
    const isPermissionViolation = 
      (error && (error.code === 1 || String(error.code) === '1')) || 
      (error && typeof error.message === 'string' && error.message.toLowerCase().includes('permissions policy')) ||
      (error && typeof error.name === 'string' && error.name.toLowerCase().includes('securityerror'));

    if (isPermissionViolation && isAdmin && unitAnchorCoordinates) {
      console.warn("[GBR v2.6] Bloqueio de política de geolocalização detectado. Ativando bypass administrativo síncrono.");
      return getAdminFallback(unitAnchorCoordinates);
    }

    throw new Error(`Falha de Geocerca: ${error && typeof error.message === 'string' ? error.message : 'Acesso negado à localização'}`);
  }
}

function getAdminFallback(anchor: { lat: number; lng: number }): GeoLocationResult {
  return {
    latitude: anchor.lat,
    longitude: anchor.lng,
    accuracy: 1.0,
    isBypassed: true,
    source: 'admin_bypass',
  };
}

export interface GpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
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
  
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    console.warn('Autônomo: Geolocation desativado ou indisponível.');
    return;
  }

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
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude
          };
          lastTimestamp = Date.now();
        }
      }
    ).catch((e: unknown) => {
      console.warn('Autônomo [Promise Catch]: erro ao registrar watchPosition (silenciado):', e);
      return null;
    });
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
        accuracy: coordinates.coords.accuracy,
        altitude: coordinates.coords.altitude
      };
      lastLocation = newLoc;
      lastTimestamp = Date.now();
      return newLoc;
    }
  } catch (err) {
    console.warn('>>> [GPS] Falha no Geolocation.getCurrentPosition Nativo, tentando Web API...', err);
  }

  // Fallback para Web Geolocation API
  return new Promise((resolve) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        console.log('>>> [GPS] Geolocalização não suportada ou indisponível.');
        resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude
          };
          lastLocation = newLoc;
          lastTimestamp = Date.now();
          resolve(newLoc);
        },
        (err) => {
          // Captura silenciosa de erros de permissão ou política
          console.warn('>>> [GPS] Fallback Web Geolocation erro (silenciado):', err.message);
          resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
      );
    } catch (e) {
      console.warn('>>> [GPS] Geolocation Web API lançou exceção (silenciada):', e);
      resolve(lastLocation || { lat: -16.6869, lng: -49.2648 });
    }
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

/**
 * Converte altitude bruta em andar (Lógica GBR v25)
 * Assume 3.0 metros por pavimento
 */
export const convertAltitudeToFloor = (altitude: number | null | undefined): number => {
  if (altitude === null || altitude === undefined) return 0;
  // Se altitude for negativa (subsolo), arredonda pra baixo
  if (altitude < 0) return Math.floor(altitude / 3.0);
  return Math.floor(altitude / 3.0);
};
