export interface CargaExpertRow {
  tenantId: string;         // Índice 0 (Tranca Invisível de Segurança)
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
  sn1_recno: number;        // Índice 19
  sn3_recno: number;        // Índice 20
}
