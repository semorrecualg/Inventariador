import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';

export const requestAllPermissions = async () => {
  if (!Capacitor.isNativePlatform()) {
    console.log('>>> [Permissions] Não em plataforma nativa. Ignorando solicitação de permissões nativas.');
    return true;
  }

  try {
    console.log('>>> [Permissions] Solicitando permissões em massa (GPS, Câmera, Arquivos)...');
    
    // GPS
    console.log('>>> [Permissions] Verificando GPS...');
    const gpsStatus = await Geolocation.checkPermissions();
    if (gpsStatus.location !== 'granted') {
      console.log('>>> [Permissions] Solicitando GPS...');
      await Geolocation.requestPermissions();
    }
    
    // Camera
    console.log('>>> [Permissions] Verificando Câmera...');
    const cameraStatus = await Camera.checkPermissions();
    if (cameraStatus.camera !== 'granted' || cameraStatus.photos !== 'granted') {
      console.log('>>> [Permissions] Solicitando Câmera...');
      await Camera.requestPermissions();
    }
    
    // Filesystem
    console.log('>>> [Permissions] Verificando Filesystem...');
    const fsStatus = await Filesystem.checkPermissions();
    if (fsStatus.publicStorage !== 'granted') {
        console.log('>>> [Permissions] Solicitando Filesystem...');
        await Filesystem.requestPermissions();
    }

    console.log('>>> [Permissions] Ciclo de solicitação concluído.');
    return true;
  } catch (err) {
    console.error('>>> [Permissions] Erro ao solicitar permissões:', err);
    return false;
  }
};
