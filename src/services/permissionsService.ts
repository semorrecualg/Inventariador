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
    
    // GPS
    await Geolocation.requestPermissions();
    
    // Camera
    await Camera.requestPermissions();
    
    // Filesystem
    const fsStatus = await Filesystem.checkPermissions();
    if (fsStatus.publicStorage !== 'granted') {
        await Filesystem.requestPermissions();
    }

    console.log('>>> [Permissions] Ciclo de permissões concluído.');
    return true;
  } catch (err) {
    console.error('>>> [Permissions] Erro crítico ao solicitar permissões de hardware no boot:', err);
    return false;
  }
};
