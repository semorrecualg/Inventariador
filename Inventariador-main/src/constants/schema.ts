
/**
 * SCHEMA CONSTANTS - Dicionário Central de Mapeamento
 * Versão: v25.01 (Audit Optimized)
 */

export const DB_ASSET_COLUMNS = [
  'id', 'ETIQUETA', 'REGISTRO', 'DESCRICAODOATIVO', 'VLRAQUISIC', 'DATAAQUISIC',
  'CENTRODECUSTO', 'conta_contabil', 'TAG_INVENTARIO', 'ESTADO_CONSERVACAO',
  'GRUPO_EMPRESARIAL', 'UNIDADE', 'QT', 'SERIAL',
  'CNPJ', 'NOMEFORNECEDOR', 'NOTAFISCAL', 'ENDERECO', 
  'tenantid', 'filial',
  '_unitid', '_unidade', '_conferido', '_localMaster',
  '_lastUpdated', '_dataLeitura', '_auditor', '_photoUrl', 'latitude', 'longitude',
  'currentCampaignId', '_version', '_is_deleted', '_plaquetado', '_plaquetaMaster',
  '_descricaoMaster', '_aprovado', '_dataAprovacao', '_aprovador', '_assinatura',
  '_isNew', '_is_unitized', '_is_divergent_baixa', 'Sn1_recno', 'Sn3_recno', 'DE_PARA',
  'AUDITOR_STATUS_CONFERENCIA', '_origemTransacao', '_parent_id', '_is_synced',
  '_altitude_metros', '_id_andar', 'STATUS', 'DATABAIXA',
  'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial', 'dataaqusic', 'cnpj',
  'nomefornecedor', 'notafiscal', 'endereco', 'registro', 'subreg', 'databaixa',
  'contacontabil', 'primarykey', 'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
];

/**
 * CANONICAL_KEY_MAP — Fase C (§3.1): resolve as variantes UPPER/mixed (dupla
 * grafia D1) para a chave canônica minúscula do contrato. NÃO substitui
 * DB_ASSET_COLUMNS/SCHEMA_PRIORITY (dicionário de importação do Excel —
 * permanece intacto); cobre apenas chaves de runtime/payload. Consumido por
 * `canonicalKey()` em src/utils/normalize.ts.
 */
export const CANONICAL_KEY_MAP: Record<string, string> = {
  FILIAL: 'filial',
  UNIDADE: 'filial',
  EMPRESA: 'filial',
  ETIQUETA: 'etiqueta',
  PLAQUETA: 'tag',
  TAG: 'tag',
  TAG_INVENTARIO: 'tag',
  STATUS: 'status',
  QT: 'qt',
  DESCRICAODOATIVO: 'descricaodoativo',
  SERIAL: 'serial',
  DATAAQUISIC: 'dataaqusic',
  DATAAQUSIC: 'dataaqusic', // typo histórico do cabeçalho Excel (staging) — sinônimo
  DATABAIXA: 'databaixa',
  CNPJ: 'cnpj',
  NOMEFORNECEDOR: 'nomefornecedor',
  NOTAFISCAL: 'notafiscal',
  ENDERECO: 'endereco',
  ENDEREÇO: 'endereco', // variante acentuada do cabeçalho
  REGISTRO: 'registro',
  SUBREG: 'subreg',
  CONTACONTABIL: 'contacontabil',
  CONTA_CONTABIL: 'contacontabil',
  PRIMARYKEY: 'primarykey',
  CENTRODECUSTO: 'centrodecusto',
  CENTRO_DE_CUSTO: 'centrodecusto',
  VLRAQUISIC: 'vlraquisic',
  SN1_RECNO: 'sn1_recno',
  SN3_RECNO: 'sn3_recno'
};

export const SCHEMA_PRIORITY = {
  UNIT: [
    'FILIAL',
    'UNIDADE',
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
    'DESCRICAODOATIVO',
    'DESCRICAODOBEM',
    'DESCRICAO',
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
    'conta_contabil',
    'CONTACONTABIL',
    'CONTA_CONTABIL',
    'CONTA',
    'N1_CONTA',
    'PLANO'
  ],
  DATE: [
    'DATAAQUISIC',
    'DATAAQUSIC',
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
