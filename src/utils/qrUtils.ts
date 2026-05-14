
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
  'DATAAQUISIC',
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
  
  // 1. Limpeza inicial e normalização
  const raw = data.trim();
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  if (lines.length === 0) return '';

  // 2. Se for uma única linha, pode ser apenas a etiqueta direta
  if (lines.length === 1) {
    // Remove prefixos comuns se existirem (ex: "ETIQUETA: 001234" -> "001234")
    return lines[0].replace(/^(ETIQUETA|PLAQUETA|ATIVO|ID|TAG):?\s*/i, '').trim();
  }

  // 3. Se houver múltiplas linhas, procurar por labels conhecidos
  // Prioridade 1: "ETIQUETA:" ou "PLAQUETA:"
  const etqLine = lines.find(l => /^(ETIQUETA|PLAQUETA):/i.test(l));
  if (etqLine) {
    const parts = etqLine.split(':');
    if (parts.length > 1) return parts[1].trim();
  }

  // Prioridade 2: "ATIVO:" (comum em alguns sistemas)
  const ativoLine = lines.find(l => /^ATIVO:/i.test(l));
  if (ativoLine) {
    const parts = ativoLine.split(':');
    if (parts.length > 1) return parts[1].trim();
  }

  // Prioridade 3: Procurar por um padrão de 6 dígitos (comum para etiquetas)
  const sixDigitMatch = raw.match(/\b\d{6}\b/);
  if (sixDigitMatch) {
    return sixDigitMatch[0];
  }

  // 4. Fallback: Usar a ordem oficial se houver exatamente o número de campos esperado
  if (lines.length === QR_FIELD_ORDER.length) {
    const etqIndex = QR_FIELD_ORDER.indexOf('ETIQUETA');
    if (etqIndex !== -1) return lines[etqIndex];
  }

  // 5. Último recurso: Retornar a primeira linha limpa, removendo possíveis labels genéricos
  return lines[0].replace(/^[A-Z\s]+:?\s*/i, '').trim();
};
