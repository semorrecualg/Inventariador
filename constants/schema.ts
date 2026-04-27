
/**
 * SCHEMA CONSTANTS - Dicionário Central de Mapeamento
 * Versão: v25.01 (Audit Optimized)
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
