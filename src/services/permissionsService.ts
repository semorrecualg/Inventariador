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
    
    // GPS - Solicitação explícita por tipo
    try {
      const locationStatus = await Geolocation.checkPermissions();
      if (locationStatus.location !== 'granted') {
        await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      }
    } catch (e) {
      console.warn('Falha ao solicitar GPS:', e);
    }
    
    // Camera
    try {
      const cameraStatus = await Camera.checkPermissions();
      if (cameraStatus.camera !== 'granted') {
        await Camera.requestPermissions();
      }
    } catch (e) {
      console.warn('Falha ao solicitar Câmera:', e);
    }
    
    // Filesystem - Tratamento especial para Android 13+ (API 33+)
    try {
      const fsStatus = await Filesystem.checkPermissions();
      if (fsStatus.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
      }
    } catch (e) {
      console.warn('Falha ao solicitar Armazenamento:', e);
    }

    console.log('>>> [Permissions] Ciclo de permissões concluído.');
    return true;
  } catch (err) {
    console.error('>>> [Permissions] Erro crítico ao solicitar permissões de hardware no boot:', err);
    return false;
  }
};
