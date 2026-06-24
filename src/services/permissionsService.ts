import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem } from '@capacitor/filesystem';

/**
 * Checa o status atual das permissões de forma assíncrona, sem bloquear o boot ou forçar prompts nativos.
 * Essencial para cumprir regras da App Store/Google Play sem causar travamentos em tempo de login.
 */
export const checkPastPermissions = async (): Promise<boolean> => {
  if (Capacitor.getPlatform() === 'web' || !Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const cameraStatus = await Camera.checkPermissions();
    const geoStatus = await Geolocation.checkPermissions();
    
    // Retorna se estão prontas, mas NÃO bloqueia o app se não estiverem
    return cameraStatus.camera === 'granted' && geoStatus.location === 'granted';
  } catch (error) {
    console.error('[Permissions] Erro ao checar permissões', error);
    return false;
  }
};

/**
 * Solicita ativamente todas as permissões em tempo de execução de forma assíncrona sob demanda.
 */
export const requestAllPermissions = async (): Promise<boolean> => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('>>> [Permissions] Modo WEB: Permissões assumidas como aceitas sob demanda.');
    return true;
  }

  try {
    console.log('>>> [Permissions] Iniciando request assíncrono nativo (Câmera, GPS, FS)...');
    
    // Verifica primeiro se já estão pré-concedidas
    const alreadyGranted = await checkPastPermissions();
    if (alreadyGranted) {
      return true;
    }

    const cameraStatus = await Camera.requestPermissions();
    const geoStatus = await Geolocation.requestPermissions();
    const fsStatus = await Filesystem.requestPermissions();

    const allGranted = (
      cameraStatus.camera === 'granted' && 
      geoStatus.location === 'granted' &&
      (fsStatus.publicStorage === 'granted' || fsStatus.external === 'granted')
    );

    console.log('>>> [Permissions] Conclusão do request nativo:', { allGranted });
    return allGranted;
  } catch (err) {
    console.error('>>> [Permissions] Erro ao solicitar permissões nativas:', err);
    return false;
  }
};

