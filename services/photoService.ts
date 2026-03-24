import localforage from 'localforage';

const PHOTO_STORE_NAME = 'gbr_local_photos_v24';

const photoStore = localforage.createInstance({
  name: 'GBR_Inventory_App',
  storeName: PHOTO_STORE_NAME
});

/**
 * Salva uma foto localmente vinculada a um ativo
 */
export const saveLocalPhoto = async (assetId: string, photoBlob: Blob): Promise<void> => {
  try {
    await photoStore.setItem(assetId, photoBlob);
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
    return await photoStore.getItem<Blob>(assetId);
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
