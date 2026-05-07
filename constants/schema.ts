
/**
 * SCHEMA CONSTANTS - Dicionário Central de Mapeamento
 * Versão: v25.01 (Audit Optimized)
 */

export const DB_ASSET_COLUMNS = [
  'id', 'ETIQUETA', 'REGISTRO', 'DESCRICAODOATIVO', 'DESCRICAODOBEM', 'MARCA', 'MODELO', 'STATUS', 'VLRAQUISIC', 'DATAAQUISIC',
  'CENTRODECUSTO', 'CONTACONTABIL', 'TAG_INVENTARIO', 'ESTADO_CONSERVACAO',
  'GRUPO_EMPRESARIAL', 'UNIDADE_OPERACIONAL', 'UNIDADE', 'QT', 'SERIAL',
  'CNPJ', 'NOMEFORNECEDOR', 'NOTAFISCAL', 'ENDERECO', 'SUBREG', 'DATABAIXA',
  'PRIMARYKEY', '_tenantid', '_unitid', '_unidade', '_conferido', '_localMaster',
  '_lastUpdated', '_dataLeitura', '_auditor', '_photoUrl', '_history', '_camposAlterados', '_valoresOriginais', '_lat', '_lng',
  '_campaignId', '_version', '_is_deleted', '_plaquetado', '_plaquetaMaster',
  '_descricaoMaster', '_aprovado', '_dataAprovacao', '_aprovador', '_assinatura',
  '_isNew', '_is_unitized', '_is_divergent_baixa', 'Sn1_recno', 'Sn3_recno', 'DE_PARA',
  'AUDITOR_STATUS_CONFERENCIA', '_origemTransacao', '_parent_id', '_is_synced', 
  '_gps_accuracy', '_ocr_verified', '_altitude_level', '_pos_timestamp'
];

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

export type FieldInputType = 'text' | 'date' | 'number' | 'currency' | 'camera' | 'select' | 'boolean';

export interface FieldMetadata {
  label: string;
  type: FieldInputType;
  icon?: string; // lucide-react icon name as string
  isSystem?: boolean;
}

export const FIELD_METADATA: Record<string, FieldMetadata> = {
  ETIQUETA: { label: 'Plaqueta Patrimonial', type: 'camera', icon: 'FileText' },
  REGISTRO: { label: 'Registro Mestre', type: 'text', icon: 'Hash' },
  DESCRICAODOATIVO: { label: 'Descrição do Ativo', type: 'text', icon: 'Info' },
  DESCRICAODOBEM: { label: 'Descrição do Bem', type: 'text', icon: 'Info' },
  MARCA: { label: 'Marca', type: 'text', icon: 'Briefcase' },
  MODELO: { label: 'Modelo', type: 'text', icon: 'Briefcase' },
  QT: { label: 'Quantidade', type: 'number', icon: 'Hash' },
  SERIAL: { label: 'Número de Série', type: 'camera', icon: 'Hash' },
  VLRAQUISIC: { label: 'Valor de Aquisição', type: 'currency', icon: 'Wallet' },
  DATAAQUISIC: { label: 'Data de Aquisição', type: 'date', icon: 'Calendar' },
  DATABAIXA: { label: 'Data de Baixa', type: 'date', icon: 'Calendar' },
  STATUS: { label: 'Status Operacional', type: 'text', icon: 'ShieldCheck' },
  ESTADO_CONSERVACAO: { label: 'Estado de Conservação', type: 'text', icon: 'FileText' },
  CENTRODECUSTO: { label: 'Centro de Custo', type: 'text', icon: 'Briefcase' },
  CONTACONTABIL: { label: 'Conta Contábil', type: 'text', icon: 'Briefcase' },
  ENDERECO: { label: 'Endereço / Localização', type: 'text', icon: 'MapPin' },
  _conferido: { label: 'Conferido', type: 'boolean', isSystem: true, icon: 'CheckCircle2' },
  _dataLeitura: { label: 'Data da Leitura', type: 'date', isSystem: true, icon: 'Calendar' },
  _photoUrl: { label: 'Evidência Fotográfica', type: 'camera', isSystem: true, icon: 'Camera' }
};

export const EXTRA_LABELS: Record<string, string> = {
  MARCA: 'Marca',
  MODELO: 'Modelo',
  QT: 'Quantidade',
  REGISTRO: 'Registro Mestre',
  SUBREG: 'Sub-Registro',
  PRIMARYKEY: 'Chave Primária (PK)',
  STATUS: 'Status Operacional',
  ESTADO_CONSERVACAO: 'Estado de Conservação',
  DATABAIXA: 'Data de Baixa',
  Sn1_recno: 'ID Protheus (SN1)',
  Sn3_recno: 'ID Protheus (SN3)',
  _dataLeitura: 'Data/Hora Inventário',
  _auditor: 'Auditor Responsible',
  _localMaster: 'Local Originário',
  _lat: 'Latitude',
  _lng: 'Longitude',
  _history: 'Histórico de Auditoria',
  _camposAlterados: 'Campos Alterados',
  _valoresOriginais: 'Valores Originais',
  _version: 'Versão do Registro',
  _is_synced: 'Sincronizado',
  _plaquetado: 'Plaquetado'
};

export const DEFAULT_EDITABLE_FIELDS = [
  'ETIQUETA', 'SERIAL', 'DESCRICAODOATIVO', 'DESCRICAODOBEM', 'MARCA', 'MODELO', 'STATUS', 'ESTADO_CONSERVACAO',
  'CENTRODECUSTO', 'ENDERECO', 'NOTAFISCAL', 'DATAAQUISIC', 'VLRAQUISIC'
];
