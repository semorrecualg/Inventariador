import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const PHOTO_STORE_NAME = 'gbr_local_photos_v24';

const photoStore = localforage.createInstance({
  name: 'GBR_Inventory_App',
  storeName: PHOTO_STORE_NAME
});

/**
 * Salva uma foto localmente vinculada a um ativo
 * v2.6: Persistent Direct storage for Native
 */
export const saveLocalPhoto = async (assetId: string, photoBlob: Blob): Promise<void> => {
  try {
    // 1. Sempre salva no IndexedDB (Cache principal para UI rápida)
    await photoStore.setItem(assetId, photoBlob);
    
    // 2. No Nativo, salva também no Filesystem (Soberania de Dados)
    if (Capacitor.isNativePlatform()) {
      try {
        const reader = new FileReader();
        reader.readAsDataURL(photoBlob);
        reader.onloadend = async () => {
          const base64data = (reader.result as string).split(',')[1];
          await Filesystem.writeFile({
            path: `AuditoriaGBR/photos/asset_${assetId}.jpg`,
            data: base64data,
            directory: Directory.Documents,
            recursive: true
          });
          console.log(`[NativePhoto] Backup persistente salvo em Documents para o ativo ${assetId}`);
        };
      } catch (nativeErr) {
        console.error('[NativePhoto] Erro na persistência nativa:', nativeErr);
      }
    }
    
    console.log(`[PhotoService] Foto salva localmente para o ativo ${assetId}`);
  } catch (error) {
    console.error('[PhotoService] Erro ao salvar foto localmente:', error);
  }
};

/**
 * Recupera uma foto local vinculada a um ativo
 */
export const getLocalPhoto = async (assetId: string): Promise<Blob | null> => {
  try {
    // Tenta primeiro no cache rápido
    const blob = await photoStore.getItem<Blob>(assetId);
    if (blob) return blob;

    // Se falhar e for Nativo, tenta recuperar do Filesystem
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.readFile({
          path: `AuditoriaGBR/photos/asset_${assetId}.jpg`,
          directory: Directory.Documents
        });
        
        if (result.data) {
          const byteCharacters = atob(result.data as string);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Blob([byteArray], { type: 'image/jpeg' });
        }
      } catch {
        console.warn(`[NativePhoto] Foto não encontrada no Filesystem para o ativo ${assetId}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('[PhotoService] Erro ao recuperar foto local:', error);
    return null;
  }
};

/**
 * Remove uma foto local vinculada a um ativo
 */
export const deleteLocalPhoto = async (assetId: string): Promise<void> => {
  try {
    await photoStore.removeItem(assetId);
    
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.deleteFile({
          path: `AuditoriaGBR/photos/asset_${assetId}.jpg`,
          directory: Directory.Documents
        });
      } catch {
        // Silencioso se o arquivo já não existir
      }
    }
  } catch (error) {
    console.error('[PhotoService] Erro ao remover foto local:', error);
  }
};

/**
 * Limpa todas as fotos locais
 */
export const clearLocalPhotos = async (): Promise<void> => {
  await photoStore.clear();
};

/**
 * Retorna todos os IDs de ativos que possuem fotos locais
 */
export const getAllLocalPhotoIds = async (): Promise<string[]> => {
  try {
    return await photoStore.keys();
  } catch (error) {
    console.error('[PhotoService] Erro ao recuperar chaves de fotos:', error);
    return [];
  }
};

/**
 * Retorna o número de fotos armazenadas localmente
 */
export const getLocalPhotoCount = async (): Promise<number> => {
  return await photoStore.length();
};
