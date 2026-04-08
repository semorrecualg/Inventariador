import imageCompression from 'browser-image-compression';

/**
 * Redimensiona e comprime uma imagem para reduzir o espaço de armazenamento.
 * Usa browser-image-compression para melhor suporte a orientação EXIF e performance.
 */
export const compressImage = async (
  file: File | Blob
): Promise<Blob> => {
  try {
    // Verifica se é uma imagem
    if (!file.type.startsWith('image/')) {
      return file;
    }

    const options = {
      maxSizeMB: 0.2, // Perfil WhatsApp: ~200KB (Equilíbrio entre qualidade e storage)
      maxWidthOrHeight: 1600, // Resolução padrão WhatsApp para fotos nítidas
      useWebWorker: true,
      initialQuality: 0.8, // Começa com qualidade alta e reduz se necessário
      fileType: 'image/jpeg'
    };
    
    return await imageCompression(file as File, options);
  } catch (error) {
    console.error('Erro na compressão de imagem:', error);
    return file;
  }
};
