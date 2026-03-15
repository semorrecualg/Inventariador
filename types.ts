
export interface User {
  username: string;
  email: string;
  password?: string;
  isAdmin?: boolean;
  mustChangePassword?: boolean;
}

export enum DatabaseStatus {
  EMPTY = 'EMPTY',
  LOADED = 'LOADED',
  IN_USE = 'IN_USE'
}

export enum TagInventario {
  PENDENTE = 'PENDENTE',
  BAIXADO = 'BAIXADO',
  CONFERIDO = 'CONFERIDO',
  ADOTADO = 'ADOTADO',
  RE_ADOTADO = 'RE_ADOTADO',
  NOVO_ITEM = 'NOVO ITEM',
  ADOTADO_EXTERNO = 'ADOTADO EXTERNO',
  DIVERGENCIA = 'DIVERGÊNCIA',
  FALTA_ETIQUETAR = 'FALTA ETIQUETAR',
  ETIQUETADO = 'ETIQUETADO'
}

export enum ConservationState {
  NOVO = 'NOVO',
  BOM = 'BOM',
  RECUPERAVEL = 'RECUPERAVEL',
  INSERVIVEL = 'INSERVIVEL'
}

export interface Asset {
  [key: string]: string | number | boolean | string[] | Record<string, string | number | boolean | string[] | null | undefined> | undefined | null;
  id: string | number;
  
  // Estrutura Mestre v24
  EMPRESA?: string;
  STATUS?: string;
  ETIQUETA?: string;
  QT?: string | number;
  DESCRICAODOATIVO?: string;
  SERIAL?: string;
  DATAAQUSIC?: string;
  CNPJ?: string;
  NOMEFORNECEDOR?: string;
  NOTAFISCAL?: string;
  ENDERECO?: string;
  REGISTRO?: string;
  SUBREG?: string;
  DATABAIXA?: string;
  CONTACONTABIL?: string;
  PRIMARYKEY?: string;
  CENTRODECUSTO?: string;
  VLRAQUISIC?: string | number;

  // Campos de Controle Interno
  _conferido?: boolean;
  _plaquetado?: boolean; // Novo campo para separar do inventário físico
  _plaquetaMaster?: string; 
  _localMaster?: string;    
  _empresaNormalizada?: string;
  _descricaoMaster?: string;
  _baseSinteticaLoc?: string[];
  _camposAlterados?: string[]; 
  _valoresOriginais?: Record<string, string | number | boolean | string[] | null | undefined>;
  
  // Tags de Auditoria
  TAG_DUPLICIDADE?: 'ÚNICO' | 'ETIQUETA+1REGISTRO' | 'DUPLICIDADE EXTERNA' | 'SEM IDENTIFICAÇÃO';
  TAG_INVENTARIO?: TagInventario;
  ESTADO_CONSERVACAO?: ConservationState;
  _isNew?: boolean;
  _dataLeitura?: string;
}

export enum AppScreen {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  MAIN_MENU = 'MAIN_MENU',
  LOAD_DATABASE = 'LOAD_DATABASE',
  ASSET_DETAIL = 'ASSET_DETAIL',
  DASHBOARD = 'DASHBOARD',
  SETTINGS = 'SETTINGS',
  INVENTORY = 'INVENTORY',
  LABELING = 'LABELING', // Nova tela independente
  CONSULTATION = 'CONSULTATION',
  COMPANY_SELECTION = 'COMPANY_SELECTION',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  FIELD_CONFIGURATOR = 'FIELD_CONFIGURATOR',
  QR_CODE_CONFIGURATOR = 'QR_CODE_CONFIGURATOR',
  QR_CONFIGURATOR = 'QR_CONFIGURATOR',
  GLOBAL_PERFORMANCE = 'GLOBAL_PERFORMANCE',
  ACCOUNT_RECONCILIATION = 'ACCOUNT_RECONCILIATION'
}

export enum ScannerMode {
  BARCODE = 'BARCODE',
  QRCODE = 'QRCODE'
}

export enum ScanFeedbackMode {
  VIBRATE = 'VIBRATE',
  SOUND = 'SOUND',
  BOTH = 'BOTH',
  NONE = 'NONE'
}

export enum InventorySearchMode {
  MANUAL = 'MANUAL',
  SCANNER = 'SCANNER'
}

export interface InventoryState {
  assets: Asset[];
  companies: string[];
  lastUpdated: string | null;
  status: DatabaseStatus;
  editableFields?: string[]; 
  qrCodeFields?: string[];
  scannerMode?: ScannerMode;
  autoConfirmOnScan?: boolean;
  scanFeedbackMode?: ScanFeedbackMode;
  inventorySearchMode?: InventorySearchMode;
}
