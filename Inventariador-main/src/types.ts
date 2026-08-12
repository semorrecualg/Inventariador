
export enum UserRole {
  ADMIN = 'ADMIN',
  MASTER = 'MASTER',
  AUDITOR = 'AUDITOR',
  AUXILIARY_AUDITOR = 'AUXILIARY_AUDITOR',
  USER = 'USER', // OPERADOR de campo (Trilha C)
  DEMO = 'DEMO',
  MOBILE_SINGLE = 'MOBILE_SINGLE'
}

export interface User {
  id?: string; // UUID do Supabase
  username: string;
  name?: string; // Nome completo para exibição
  email: string;
  password?: string;
  role: UserRole;
  is_admin?: boolean; // Novo padrão unificado
  isAdmin?: boolean; // Deprecated: use is_admin
  isSuperAdmin?: boolean; // Super administrator flag
  mustChangePassword?: boolean;
  quickLogin?: boolean;   // Sub-usuário de "login rápido" (credencial local, encapsulado no tenant do MASTER)
  tenantid: string;   // 1ª Coluna / ID do Tenant (ex: CICOPAL) - Oficial
  filial?: string;    // 2ª Coluna / Unidade Operacional - Oficial
  // @deprecated Legado (somente leitura): use 'filial'
  _unitid?: string;
  unitid?: string;   // @deprecated Legado: use filial
  units?: string[];  // Lista de Unidades Operacionais autorizadas
}

export enum TransactionOrigin {
  INVENTORY = '200',
  LABELING = '400',
  ACCOUNT_RECONCILIATION = '600',
  IMPAIRMENT_AUTOMATION = '800'
}

export interface AuditLogEntry {
  timestamp: string;
  user: string;
  user_email?: string; // Para compatibilidade com Supabase
  action: string;
  table_name?: string;
  record_id?: string;
  old_data?: unknown;
  new_data?: unknown;
  details?: string;
  tenantid?: string;
  origin?: TransactionOrigin;
}

export enum DatabaseStatus {
  EMPTY = 'EMPTY',
  LOADED = 'LOADED',
  IN_USE = 'IN_USE',
  ERROR = 'ERROR',
  ACTIVE = 'ACTIVE',
  INITIALIZING = 'INITIALIZING'
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

import { Asset } from './types/inventory';

export type { Asset };

export interface NCMClassifier {
  id: string;
  ncm_code: string; // Código NCM
  description: string; // Descrição do Bem
  group_code: string; // Código do Grupo (4 dígitos)
  annual_depreciation_rate: number;
  useful_life_months: number;
  tenantid: string;
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
  tenantid: string;
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
  tenantid: string;
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
  tenantid: string;
}

export interface DepreciationHistory {
  id: string;
  asset_id: string;
  period_month: number;
  period_year: number;
  depreciation_value: number;
  accumulated_depreciation: number;
  residual_value: number;
  tenantid: string;
}

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  onConfirm?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
  confirmText?: string;
  cancelText?: string;
}

export enum AppScreen {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  MAIN_MENU = 'MAIN_MENU',
  ASSET_DETAIL = 'ASSET_DETAIL',
  DASHBOARD = 'DASHBOARD',
  INVENTORY = 'INVENTORY',
  LABELING = 'LABELING', // Nova tela independente
  CONSULTATION = 'CONSULTATION',
  UNIT_SELECTION = 'UNIT_SELECTION',
  ADDRESS_SELECTION = 'ADDRESS_SELECTION',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  FIELD_CONFIGURATOR = 'FIELD_CONFIGURATOR',
  QR_CODE_CONFIGURATOR = 'QR_CODE_CONFIGURATOR',
  GLOBAL_PERFORMANCE = 'GLOBAL_PERFORMANCE',
  ACCOUNT_RECONCILIATION = 'ACCOUNT_RECONCILIATION',
  SIGNATURE = 'SIGNATURE',
  DATABASE_MANAGER = 'DATABASE_MANAGER',
  ASSET_MAP = 'ASSET_MAP',
  ACTIVE_SEARCH = 'ACTIVE_SEARCH',
  MODULE_SELECTION = 'MODULE_SELECTION',
  ASSET_CONTROL_HOME = 'ASSET_CONTROL_HOME',
  AUDIT_LOGS = 'AUDIT_LOGS',
  CAMPAIGN_MANAGEMENT = 'CAMPAIGN_MANAGEMENT',
  ONBOARDING = 'ONBOARDING',
  BIOMETRIC_REGISTRATION = 'BIOMETRIC_REGISTRATION',
  SYNC_MANAGER = 'SYNC_MANAGER',
  SOFT_DELETE_REPORT = 'SOFT_DELETE_REPORT',
  IMPAIRMENT_REPORT = 'IMPAIRMENT_REPORT',
  UNIT_CONFIGURATOR = 'UNIT_CONFIGURATOR',
  STRESS_TEST = 'STRESS_TEST',
  ASSET_REPORT_PRINT = 'ASSET_REPORT_PRINT',
  LICENSE_PROVISIONING = 'LICENSE_PROVISIONING',
  TENANT_WORK_SELECTION = 'TENANT_WORK_SELECTION',
  LOAD_HISTORY = 'LOAD_HISTORY'
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
  INTERNAL_PLUS = 'INTERNAL_PLUS',
  SUPABASE = 'SUPABASE',
  SUPABASE_PLUS = 'SUPABASE_PLUS'
}

export interface SearchFilters {
  ETIQUETA: string;
  DESCRICAODOATIVO: string;
  SERIAL: string;
  CNPJ: string;
  NOMEFORNECEDOR: string;
  NOTAFISCAL: string;
  ENDERECO: string;
  conta_contabil: string; // Novo padrão v25
  CENTRODECUSTO: string;
  DATAAQUISIC_START: string;
  DATAAQUISIC_END: string;
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
  excludedAccounts?: string[]; // Contas contábeis a serem ignoradas na carga se BAIXADO
  databaseMode: DatabaseMode;
  currentCampaignId?: string;
  hasCompletedOnboarding?: boolean;
  isFieldMode?: boolean; // Modo de Campo (Offline Forçado)
  downloadedUnits?: string[]; // Lista de unidades baixadas para uso offline
  unitConfigs?: UnitConfig[]; // Configurações de geofencing por unidade
  _integrity_failed?: boolean; // Flag de falha de integridade SHA-256
}

export interface SyncQueueItem {
  id: string; // UUID interno da fila
  assetId: string;
  tenantid: string;
  photoBlob: Blob;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

export enum CampaignStatus {
  CREATED = 'CREATED',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED'
}

export interface InventoryCampaign {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  status: CampaignStatus;
  tenantid: string;
  filial?: string; // Canônico (Índice 1 da planilha)
  // @deprecated Legado (somente leitura): use 'filial'
  _unitid?: string;
  unit_id?: string;  // @deprecated Legado: use filial
  created_by: string;
  created_at: string;
  // Estatísticas calculadas
  total_assets?: number;
  inventoried_assets?: number;
  divergence_count?: number;
  closure_details?: {
    snapshot_status: 'PENDING' | 'COMPLETED' | 'FAILED';
    snapshot_size?: number;
    closed_by?: string;
    closed_at?: string;
  };
}

export interface CampaignSnapshot {
  id: string;
  campaign_id: string;
  snapshot_date: string;
  assets_data: Asset[];
  metadata: Record<string, unknown>;
  closed_by: string;
  tenantid: string;
}

export interface NavigationParams {
  assets?: Asset[];
  unitName?: string;
  campaign?: InventoryCampaign | null;
  mode?: 'PARTIAL' | 'FINAL';
  responsibleName?: string;
  /** Painel do MainMenu a abrir automaticamente ao chegar (usado pela tool grid da Unidade Operacional). */
  openPanel?: 'PREFERENCES' | 'DATA' | 'ADMIN' | 'AUDIT';
}

export interface UnitConfig {
  id?: string;
  tenantid: string;
  filial?: string; // Canônico (Índice 1 da planilha)
  // @deprecated Legado (somente leitura): use 'filial'
  _unitid?: string; // Nome da unidade (ex: "MATRIZ")
  unit_id?: string; // @deprecated Legado: use filial
  lat: number;
  lng: number;
  radius_meters: number;
  is_active: boolean;
  updated_at?: string;
  updated_by?: string;
}

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
  sn1_recno: number;        // Índice 19
  sn3_recno: number;        // Índice 20
}

