
export interface Asset {
  [key: string]: any;
  id: string | number;
  // Controle Interno
  _conferido?: boolean;
  _isInternalDuplicate?: boolean;
  _isExternalDuplicate?: boolean;
  _isDuplicate?: boolean; 
  _hasPlaqueta?: boolean;
  _corrigido?: boolean;
  _transferido?: boolean;
  // Colunas de Registro (Banco de Dados)
  TAG_INVENTARIO?: string;
  TAG_PLAQUETA?: string;
  TAG_DUPLICIDADE?: string;
  TAG_ADOCAO?: string; // "ADOTADO" ou vazio
}

export interface User {
  username: string;
  email: string;
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
  COMPANY_SELECTION = 'COMPANY_SELECTION'
}

export interface InventoryState {
  assets: Asset[];
  companies: string[];
  lastUpdated: string | null;
}
