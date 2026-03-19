
/**
 * Redimensiona e comprime uma imagem para reduzir o espaço de armazenamento.
 * @param file O arquivo de imagem original.
 * @param maxWidth Largura máxima permitida.
 * @param maxHeight Altura máxima permitida.
 * @param quality Qualidade do JPEG (0 a 1).
 * @returns Uma Promise que resolve em um Blob da imagem processada.
 */
export const compressImage = (
  file: File | Blob,
  maxWidth: number = 1280,
  maxHeight: number = 1280,
  quality: number = 0.6
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    // Verifica se é uma imagem
    if (!file.type.startsWith('image/')) {
      return resolve(file as Blob);
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calcula as novas dimensões mantendo o aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível obter o contexto do canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Erro ao converter canvas para Blob'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
