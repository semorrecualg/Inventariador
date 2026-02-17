
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
  // Campos Unificados v16
  PLAQUETA?: string; 
  _plaquetaMaster?: string;
  _hasPlaqueta?: boolean;
  _conferido?: boolean;
  _localMaster?: string;
  _empresaNormalizada?: string;
  _descricaoMaster?: string;
  
  // Tags de Auditoria
  TAG_DUPLICIDADE?: 'ÚNICO' | 'DUPLICIDADE INTERNA' | 'DUPLICIDADE EXTERNA' | 'SEM IDENTIFICAÇÃO';
  TAG_INVENTARIO?: string;
  
  // Flags de Controle
  _isInternalDuplicate?: boolean;
  _isExternalDuplicate?: boolean;
  _isNew?: boolean;
  PLAQUETA_INVENTARIO?: string;
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
  CHANGE_PASSWORD = 'CHANGE_PASSWORD'
}

export interface InventoryState {
  assets: Asset[];
  companies: string[];
  lastUpdated: string | null;
  status: DatabaseStatus;
}
