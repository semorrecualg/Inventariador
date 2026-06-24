// src/types/inventory.ts

export interface CargaExpertRow {
  tenantid: string;         // Índice 0 (Tranca Invisível de Segurança)
  filial: string;           // Índice 1 (Unidade Física Real - Antiga unit_key)
  status: string;           // Índice 2
  etiqueta: string;         // Índice 3
  qt: number;               // Índice 4
  descricaodoativo: string; // Índice 5
  serial: string;           // Índice 6
  dataaqusic: string;       // Índice 7
  cnpj: string;             // Índice 8
  nomefornecedor: string;   // Índice 9
  notafiscal: string;       // Índice 10
  endereco: string;         // Índice 11
  registro: string;         // Índice 12
  subreg: string;           // Índice 13
  databaixa: string;        // Índice 14
  contacontabil: string;    // Índice 15
  primarykey: string;       // Índice 16 (Chave Primária Alfanumérica Absoluta)
  centrodecusto: string;    // Índice 17
  vlraquisic: number;       // Índice 18
  sn1_recno: number | null; // Índice 19
  sn3_recno: number | null; // Índice 20
}

export interface Asset {
  // Identificador opcional do registro e controle nativo (SQLite / Memory)
  id?: string | number;

  // Os 21 campos fiscais e operacionais unificados (Índices da planilha de Carga Expert)
  tenantid: string;         // Índice 0
  filial: string;           // Índice 1
  status: string;           // Índice 2
  etiqueta: string;         // Índice 3
  qt: number;               // Índice 4
  descricaodoativo: string; // Índice 5
  serial: string;           // Índice 6
  dataaqusic: string;       // Índice 7
  cnpj: string;             // Índice 8
  nomefornecedor: string;   // Índice 9
  notafiscal: string;       // Índice 10
  endereco: string;         // Índice 11
  registro: string;         // Índice 12
  subreg: string;           // Índice 13
  databaixa: string;        // Índice 14
  contacontabil: string;    // Índice 15
  primarykey: string;       // Índice 16
  centrodecusto: string;    // Índice 17
  vlraquisic: number;       // Índice 18
  sn1_recno: number | null; // Índice 19
  sn3_recno: number | null; // Índice 20

  // Controle de Auditoria SRE e Sincronização Local-First (Underline / Metadados)
  _conferido?: boolean;
  _photoUrl?: string;
  _tenantid?: string;
  _unitid?: string;
  _is_deleted?: boolean | number;
  _is_synced?: boolean | number;
  _version?: number;
  _auditor?: string;
  _dataLeitura?: string;
  _isNew?: boolean;
  _is_divergent_baixa?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _history?: any[];
  gps_lat?: number | null;
  gps_lng?: number | null;
  _localMaster?: string;
  _origemTransacao?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _valoresOriginais?: Record<string, any>;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
