
/**
 * Utilitário para captura de geolocalização (GPS)
 */

export interface GpsLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export const getCurrentLocation = (): Promise<GpsLocation> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo navegador.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        let msg = 'Erro ao obter localização.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Permissão de localização negada pelo usuário.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Informação de localização indisponível.';
            break;
          case error.TIMEOUT:
            msg = 'Tempo esgotado ao tentar obter localização.';
            break;
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
};
