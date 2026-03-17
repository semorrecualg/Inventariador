
/**
 * Utilitário para lidar com os dados do QR Code em texto puro.
 */

/**
 * Tenta extrair o número da etiqueta de uma string de dados do QR Code.
 * O formato esperado é "ATIVO: 000000" em uma das linhas.
 * Se não encontrar o formato, retorna a string original (caso seja um QR de etiqueta simples).
 */
/**
 * Ordem oficial dos campos no QR Code conforme solicitação do usuário.
 */
export const QR_FIELD_ORDER = [
  'EMPRESA',
  'STATUS',
  'ETIQUETA',
  'QT',
  'DESCRICAODOATIVO',
  'SERIAL',
  'DATAAQUSIC',
  'CNPJ',
  'NOMEFORNECEDOR',
  'NOTAFISCAL',
  'ENDERECO',
  'REGISTRO',
  'SUBREG',
  'DATABAIXA',
  'CONTACONTABIL',
  'PRIMARYKEY',
  'VLRAQUISIC' // Mapeado de VLRAQUISICAO
];

/**
 * Tenta extrair o número da etiqueta de uma string de dados do QR Code.
 */
export const extractEtiquetaFromQrData = (data: string): string => {
  if (!data) return '';
  
  const lines = data.split('\n').map(l => l.trim()).filter(l => l !== '');
  if (lines.length === 0) return '';

  // 1. Tenta encontrar o prefixo "ATIVO:" (compatibilidade)
  for (const line of lines) {
    if (line.toUpperCase().startsWith('ATIVO:')) {
      const parts = line.split(':');
      if (parts.length > 1) return parts[1].trim();
    }
  }

  // 2. Tenta encontrar uma linha que tenha exatamente 6 dígitos (padrão de etiqueta)
  for (const line of lines) {
    if (/^\d{6}$/.test(line)) {
      return line;
    }
  }

  // 3. Se não encontrar padrão, assume que a etiqueta é o que estiver na posição 
  // que costuma ser a ETIQUETA (3ª linha se Empresa/Status estiverem presentes)
  // Mas por segurança, se nada for achado, retorna a primeira linha.
  return lines[0];
};
