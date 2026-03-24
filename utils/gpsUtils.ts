
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
let watchId: number | null = null;

/**
 * Inicia o rastreamento autônomo em segundo plano
 */
export const startAutonomousTracking = () => {
  if (watchId !== null || !navigator.geolocation) return;

  console.log('Iniciando Rastreamento Autônomo GBR v24.50...');
  
  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      lastLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      lastTimestamp = Date.now();
      // console.log('Autônomo: Coordenada renovada', lastLocation.lat, lastLocation.lng);
    },
    (err) => {
      console.warn('Autônomo: Erro no rastreio em tempo real', err.message);
    },
    options
  );
};

/**
 * Para o rastreamento autônomo
 */
export const stopAutonomousTracking = () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    console.log('Rastreamento Autônomo Finalizado.');
  }
};

export const getCurrentLocation = (forceRefresh = false): Promise<GpsLocation> => {
  const now = Date.now();
  
  // Retorna cache se for recente (30 segundos) e não for forçado
  if (!forceRefresh && lastLocation && (now - lastTimestamp < 30000)) {
    return Promise.resolve(lastLocation);
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo navegador.'));
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 10000, // 10s para alta precisão
      maximumAge: 60000
    };

    const success = (position: GeolocationPosition) => {
      const newLoc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      lastLocation = newLoc;
      lastTimestamp = Date.now();
      resolve(newLoc);
    };

    const error = (err: GeolocationPositionError) => {
      // Se falhou com alta precisão, tenta novamente com baixa precisão
      if (options.enableHighAccuracy) {
        console.warn('Falha na alta precisão, tentando baixa precisão...');
        options.enableHighAccuracy = false;
        options.timeout = 5000; // Mais 5s para baixa precisão
        navigator.geolocation.getCurrentPosition(success, finalError, options);
      } else {
        finalError(err);
      }
    };

    const finalError = (err: GeolocationPositionError) => {
      let msg = 'Erro ao obter localização.';
      switch (err.code) {
        case err.PERMISSION_DENIED:
          msg = 'Permissão de localização negada pelo usuário.';
          break;
        case err.POSITION_UNAVAILABLE:
          msg = 'Informação de localização indisponível.';
          break;
        case err.TIMEOUT:
          msg = 'Tempo esgotado ao tentar obter localização.';
          break;
      }
      
      if (lastLocation) {
        console.warn('Usando localização em cache devido a erro final:', msg);
        resolve(lastLocation);
      } else {
        reject(new Error(msg));
      }
    };

    navigator.geolocation.getCurrentPosition(success, error, options);
  });
};
