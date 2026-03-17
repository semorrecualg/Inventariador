
/**
 * Utilitário para lidar com os dados do QR Code em texto puro.
 */

/**
 * Tenta extrair o número da etiqueta de uma string de dados do QR Code.
 * O formato esperado é "ATIVO: 000000" em uma das linhas.
 * Se não encontrar o formato, retorna a string original (caso seja um QR de etiqueta simples).
 */
export const extractEtiquetaFromQrData = (data: string): string => {
  if (!data) return '';
  
  // Se contiver quebras de linha, provavelmente é o nosso formato de texto puro
  if (data.includes('\n')) {
    const lines = data.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim().toUpperCase();
      if (trimmedLine.startsWith('ATIVO:')) {
        const parts = line.split(':');
        if (parts.length > 1) {
          return parts[1].trim();
        }
      }
    }
  }
  
  // Caso contrário, assume que a string inteira é a etiqueta (comportamento legado/padrão)
  return data.trim();
};
