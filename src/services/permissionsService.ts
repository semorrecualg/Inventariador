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
    const gpsStatus = await Geolocation.checkPermissions();
    if (gpsStatus.location !== 'granted') {
      await Geolocation.requestPermissions();
    }
    
    // Camera
    const cameraStatus = await Camera.checkPermissions();
    if (cameraStatus.camera !== 'granted' || cameraStatus.photos !== 'granted') {
      await Camera.requestPermissions();
    }
    
    // Filesystem
    const fsStatus = await Filesystem.checkPermissions();
    if (fsStatus.publicStorage !== 'granted') {
        // No Android 10+, requestPermissions pode não disparar nada se já tiver o acesso necessário ao sandbox,
        // mas chamamos para garantir.
        await Filesystem.requestPermissions();
    }

    console.log('>>> [Permissions] Ciclo de solicitação concluído.');
    return true;
  } catch (err) {
    console.error('>>> [Permissions] Erro ao solicitar permissões:', err);
    return false;
  }
};
