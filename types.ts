
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
  _conferido?: boolean;
  _isInternalDuplicate?: boolean;
  _isExternalDuplicate?: boolean;
  _isDuplicate?: boolean; 
  _hasPlaqueta?: boolean;
  _corrigido?: boolean;
  _transferido?: boolean;
  _isNew?: boolean;
  TAG_INVENTARIO?: string;
  TAG_PLAQUETA?: string;
  TAG_DUPLICIDADE?: string;
  TAG_ADOCAO?: string;
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
