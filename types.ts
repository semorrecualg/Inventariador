
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

export interface Asset {
  [key: string]: any;
  id: string | number;
  
  // Estrutura Mestre v24 (Ordem de Coluna Oficial)
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
  CENTRODECUSTO?: string; // Novo Campo v24.40
  VLRAQUISIC?: string | number; // Novo Campo v24.40

  // Campos de Controle Interno (Auditor GBR)
  _conferido?: boolean;
  _plaquetaMaster?: string; 
  _localMaster?: string;    
  _empresaNormalizada?: string;
  _descricaoMaster?: string;
  _baseSinteticaLoc?: string[];
  _camposAlterados?: string[]; 
  
  // Tags de Auditoria
  TAG_DUPLICIDADE?: 'ÚNICO' | 'ETIQUETA+1REGISTRO' | 'DUPLICIDADE EXTERNA' | 'SEM IDENTIFICAÇÃO';
  TAG_INVENTARIO?: string;
  _isNew?: boolean;
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
  CONSULTATION = 'CONSULTATION',
  COMPANY_SELECTION = 'COMPANY_SELECTION',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  FIELD_CONFIGURATOR = 'FIELD_CONFIGURATOR'
}

export interface InventoryState {
  assets: Asset[];
  companies: string[];
  lastUpdated: string | null;
  status: DatabaseStatus;
  editableFields?: string[]; 
}
