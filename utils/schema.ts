
/**
 * SCHEMA.TS - Centralização de Mapeamento de Planilhas e Banco de Dados
 * Versão: v24.50.6 (GBR KARDEK)
 */

export const SCHEMA_PRIORITY = {
  UNIT: [
    'UNIDADE_OPERACIONAL',
    'UNIDADE',
    'FILIAL',
    'LOCAL',
    'LOCALIZACAO',
    'N1_LOCAL',
    'CENTRODECUSTO',
    'CENTRO_DE_CUSTO',
    'NOME_UNIDADE',
    'LOJA',
    'DEPARTAMENTO',
    'ESTABELECIMENTO',
    'AREA',
    'SETOR'
  ],
  DESCRIPTION: [
    'DESCRICAODOBEM',
    'DESCRICAO',
    'DESCRICAODOATIVO',
    'N1_DESCRIC',
    'ITEM'
  ],
  TAG: [
    'ETIQUETA',
    'PLAQUETA',
    'CHAVE',
    'CODIGO',
    'ID',
    'N1_CHAVE'
  ],
  COST_CENTER: [
    'CENTRODECUSTO',
    'CENTRO_DE_CUSTO',
    'CC_CUSTO',
    'CC',
    'CUSTO',
    'N3_CCUSTO'
  ],
  ACCOUNT: [
    'CONTACONTABIL',
    'CONTA_CONTABIL',
    'CONTA',
    'N1_CONTA',
    'PLANO'
  ],
  DATE: [
    'DATAAQUSIC',
    'DATAAQUISIC',
    'DATA_AQ',
    'DATA',
    'N1_DTACQUIS'
  ],
  VALUE: [
    'VLRAQUISIC',
    'VALOR',
    'N1_VALOR',
    'PRECO'
  ],
  INVOICE: [
    'NOTAFISCAL',
    'NF',
    'N1_NFISCAL',
    'FACTURA'
  ],
  VENDOR: [
    'NOMEFORNECEDOR',
    'FORNECEDOR',
    'VENDOR'
  ],
  SERIAL: [
    'SERIAL',
    'N1_SERIE',
    'S_N'
  ],
  ADDRESS: [
    'ENDERECO',
    'SALA',
    'LUGAR'
  ],
  GROUP: [
    'GRUPO_EMPRESARIAL',
    'EMPRESA',
    'GRUPO',
    'N1_FILIAL'
  ]
};

/**
 * Normaliza o cabeçalho para comparação (Uppercase, Trim)
 * Garante que 'unidade_operacional' === 'UNIDADE_OPERACIONAL'
 */
export const normalizeHeader = (header: string | null | undefined): string => {
  if (!header) return '';
  return header.toString().trim().toUpperCase().replace(/\s/g, '_');
};

/**
 * Encontra a melhor coluna disponível em um objeto (row) ou array de chaves com base na prioridade.
 * Implementa a estratégia de "Best Match" para resiliência de schema.
 */
export function findBestColumn(keys: string[], priorities: string[]): string | null {
  const normalizedKeys = keys.map(k => normalizeHeader(k));
  
  for (const priority of priorities) {
    const normalizedPriority = normalizeHeader(priority);
    const index = normalizedKeys.indexOf(normalizedPriority);
    if (index !== -1) {
      return keys[index]; // Retorna o nome original da chave encontrada
    }
  }
  
  return null;
}

/**
 * Obtém o valor de um ativo tentando as chaves prioritárias
 */
export function getAssetValueByPriority(asset: any, priorities: string[]): any {
  if (!asset) return null;
  const bestKey = findBestColumn(Object.keys(asset), priorities);
  return bestKey ? asset[bestKey] : null;
}

/**
 * Helper para extrair a unidade operacional de um ativo de forma soberana
 */
export function getAssetUnit(asset: any): string {
  const val = getAssetValueByPriority(asset, SCHEMA_PRIORITY.UNIT);
  return (val || '').toString().trim().toUpperCase() || 'UNIT_UNDEFINED';
}

/**
 * Mapping of internal types to user-friendly labels
 */
export const TYPE_LABELS: Record<string, string> = {
  UNIT: 'Unidade Operacional',
  DESCRIPTION: 'Descrição do Ativo',
  TAG: 'Plaqueta Patrimonial',
  COST_CENTER: 'Centro de Custo',
  ACCOUNT: 'Conta Contábil',
  DATE: 'Data de Aquisição',
  VALUE: 'Valor de Aquisição',
  INVOICE: 'Nota Fiscal',
  VENDOR: 'Fornecedor',
  SERIAL: 'Número de Série',
  ADDRESS: 'Endereço / Localização',
  GROUP: 'Grupo Empresarial'
};
