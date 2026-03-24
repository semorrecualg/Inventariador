import imageCompression from 'browser-image-compression';

/**
 * Redimensiona e comprime uma imagem para reduzir o espaço de armazenamento.
 * Usa browser-image-compression para melhor suporte a orientação EXIF e performance.
 */
export const compressImage = async (
  file: File | Blob,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 0.6
): Promise<Blob> => {
  try {
    // Verifica se é uma imagem
    if (!file.type.startsWith('image/')) {
      return file;
    }

    const options = {
      maxSizeMB: 0.15, // Alvo de 150KB
      maxWidthOrHeight: Math.max(maxWidth, maxHeight),
      useWebWorker: true,
      initialQuality: quality,
      fileType: 'image/jpeg'
    };
    
    return await imageCompression(file as File, options);
  } catch (error) {
    console.error('Erro na compressão de imagem:', error);
    return file;
  }
};
