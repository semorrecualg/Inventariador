
export enum UserRole {
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR'
}

export interface User {
  username: string;
  email: string;
  password?: string;
  role: UserRole;
  isAdmin?: boolean; // Mantido para compatibilidade
  mustChangePassword?: boolean;
  tenantId?: string; // ID primário (legado)
  tenants?: string[]; // Lista de IDs de empresas autorizadas
}

export interface AuditLogEntry {
  timestamp: string;
  user: string;
  action: string;
  details?: string;
  tenantId?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; 
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
  Sn1_recno?: number; // Identificador único do registro no Protheus (Tabela SN1)
  Sn3_recno?: number; // Identificador único do registro no Protheus (Tabela SN3 - Centro de Custo)

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
  _auditor?: string;
  _history?: AuditLogEntry[];
  _photoUrl?: string;
  _tenantId?: string;
  _lat?: number;
  _lng?: number;
  _aprovado?: boolean;
  _dataAprovacao?: string;
  _aprovador?: string;
  _assinatura?: string; // Base64 da assinatura
  DE_PARA?: string;
  AUDITOR_STATUS_CONFERENCIA?: string;

  // Novos Campos Módulo Controle de Ativo (Contábil)
  _valor_aquisicao?: number;
  _valor_residual?: number;
  _depreciacao_acumulada?: number;
  _data_aquisicao?: string;
  _data_inicio_depreciacao?: string;
  _vida_util_meses?: number;
  _taxa_depreciacao_anual?: number;
  _status_contabil?: 'ATIVO' | 'BAIXADO' | 'VENDIDO';
  _conta_contabil?: string;
  _centro_custo?: string;
  _ncm_code?: string;
}

export interface NCMClassifier {
  id: string;
  ncm_code: string; // Código NCM
  description: string; // Descrição do Bem
  group_code: string; // Código do Grupo (4 dígitos)
  annual_depreciation_rate: number;
  useful_life_months: number;
  _tenantId: string;
}

export enum DepreciationMethod {
  LINEAR = 'LINEAR',
  ACCELERATED_SUM_DIGITS = 'ACELERADA_SOMA_DIGITOS',
  ACCELERATED_DECLINING_BALANCE = 'ACELERADA_SALDO_DECRESCENTE',
  UNITS_OF_PRODUCTION = 'UNIDADES_PRODUCAO'
}

export interface AssetGroup {
  id: string;
  group_code: string; // GRUPO (4 dígitos)
  name: string; // DESCRIC
  asset_account: string; // CTACTB
  accumulated_depreciation_account: string; // CTADEP
  depreciation_expense_account: string; // CTADES
  annual_depreciation_rate: number; // TAXA
  depreciation_method: DepreciationMethod; // TIPODEPREC
  useful_life_months: number;
  _tenantId: string;
}

export enum AccountType {
  SYNTHETIC = 'S',
  ANALYTICAL = 'A'
}

export enum AccountNature {
  DEBIT = 'D',
  CREDIT = 'C'
}

export enum AccountClassification {
  ASSET = 'ATIVO',
  LIABILITY = 'PASSIVO',
  EQUITY = 'PL',
  REVENUE = 'RECEITA',
  EXPENSE = 'DESPESA',
  COST = 'CUSTO'
}

export interface ChartOfAccount {
  id: string;
  code: string; // COD_CTA
  name: string; // NOME_CTA
  type: AccountType; // IND_CTA
  level: number; // NIVEL
  parent_code?: string; // COD_CTA_SUP
  nature: AccountNature; // NATUREZA
  classification: AccountClassification; // CLASSIFICACAO
  referential_code?: string; // COD_REF (SPED)
  is_active: boolean; // STATUS
  _tenantId: string;
}

export interface AssetMovement {
  id: string;
  asset_id: string;
  type: 'TRANSFER' | 'SALE' | 'WRITE_OFF' | 'ACQUISITION' | 'REVALUATION';
  date: string;
  from_cc?: string;
  to_cc?: string;
  value?: number;
  description?: string;
  user_email: string;
  _tenantId: string;
}

export interface DepreciationHistory {
  id: string;
  asset_id: string;
  period_month: number;
  period_year: number;
  depreciation_value: number;
  accumulated_depreciation: number;
  residual_value: number;
  _tenantId: string;
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
  ACCOUNT_RECONCILIATION = 'ACCOUNT_RECONCILIATION',
  SIGNATURE = 'SIGNATURE',
  ASSET_MAP = 'ASSET_MAP',
  ACTIVE_SEARCH = 'ACTIVE_SEARCH',
  MODULE_SELECTION = 'MODULE_SELECTION',
  ASSET_CONTROL_HOME = 'ASSET_CONTROL_HOME'
}

export enum AppModule {
  INVENTORY = 'INVENTORY',
  ASSET_CONTROL = 'ASSET_CONTROL'
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

export enum DatabaseMode {
  INTERNAL = 'INTERNAL',
  SUPABASE = 'SUPABASE',
  PROTHEUS_SUPABASE = 'PROTHEUS_SUPABASE'
}

export interface SearchFilters {
  ETIQUETA: string;
  DESCRICAODOATIVO: string;
  SERIAL: string;
  CNPJ: string;
  NOMEFORNECEDOR: string;
  NOTAFISCAL: string;
  ENDERECO: string;
  CONTACONTABIL: string;
  CENTRODECUSTO: string;
  DATAAQUSIC_START: string;
  DATAAQUSIC_END: string;
  Sn1_recno?: string;
  Sn3_recno?: string;
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
  immersiveMode?: boolean;
  darkMode?: boolean;
  batterySaver?: boolean;
  protheusIntegrationEnabled?: boolean;
  protheusApiUrl?: string;
  mandatoryPhotoOnDivergence?: boolean;
  mandatoryPhotoOnNewItem?: boolean;
}

export interface SyncQueueItem {
  id: string; // UUID interno da fila
  assetId: string;
  tenantId: string;
  photoBlob: Blob;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
}
