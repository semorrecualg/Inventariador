export interface Asset {
  _uuid?: string;
  _origemTransacao?: number;
  _status_sinc?: number;
  SN1_RECNO: number;
  SN3_RECNO: number;
  C_CODIGO: string;
  C_DESCRICAO: string;
  C_STATUS_AUDIT: 'pending' | 'verified' | 'divergent' | 'not_found';
  N1_DESCRIC?: string;
  N3_CONTA?: string;
  N3_CCONTAB?: string;
  C_FILIAL?: string;
  C_GRUPO?: string;
  C_BAIXADO?: boolean;
  [key: string]: any; // Allow for the 70+ columns
}

export interface InventoryStats {
  total: number;
  verified: number;
  pending: number;
  surplus: number; // Sobras
}
