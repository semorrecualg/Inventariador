import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';

export const requestAllPermissions = async () => {
  if (Capacitor.getPlatform() === 'web') {
    console.log('>>> [Permissions] Modo WEB: Permissões de hardware via navegador conforme demanda.');
    return true;
  }

  try {
    console.log('>>> [Permissions] Solicitando permissões nativas (Soberania Mobile)...');
    
    // Requisita Câmera, Localização e Armazenamento nativas
    const cameraStatus = await Camera.requestPermissions();
    const geoStatus = await Geolocation.requestPermissions();
    const fsStatus = await Filesystem.requestPermissions();

    const allGranted = (
      cameraStatus.camera === 'granted' && 
      geoStatus.location === 'granted' &&
      (fsStatus.publicStorage === 'granted' || fsStatus.external === 'granted')
    );

    if (allGranted) {
      console.log('>>> [Permissions] Todas as permissões essenciais foram concedidas.');
    } else {
      console.warn('>>> [Permissions] Algumas permissões foram negadas:', {
        camera: cameraStatus.camera,
        location: geoStatus.location,
        filesystem: fsStatus.publicStorage
      });
    }

    return allGranted;
  } catch (err) {
    console.error('>>> [Permissions] Erro crítico ao solicitar permissões de hardware no boot:', err);
    return false;
  }
};
