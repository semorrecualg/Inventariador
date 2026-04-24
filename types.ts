
export enum UserRole {
  ADMIN = 'ADMIN',
  MASTER = 'MASTER',
  AUDITOR = 'AUDITOR',
  AUXILIARY_AUDITOR = 'AUXILIARY_AUDITOR'
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
  mustChangePassword?: boolean;
  _tenantid: string;  // ID da Organização (ex: CICOPAL) - Unificado
  _unitid?: string;   // Unidade Operacional Padrão - Unificado
  tenantid: string;  // Deprecated: use _tenantid
  tenants?: string | string[];  // Deprecated: use _tenantid
  unitid?: string;   // Deprecated: use _unitid
  units?: string[];  // Lista de Unidades Operacionais autorizadas
}

export enum TransactionOrigin {
  INVENTORY = '1000',
  LABELING = '2000',
  ACCOUNT_RECONCILIATION = '3000',
  IMPAIRMENT_AUTOMATION = '4000'
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
  _tenantid?: string;
  tenantid?: string; // Deprecated
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

export interface Asset {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; 
  id: string | number;
  
  // Estrutura Mestre v24 (Nomenclatura de Negócio)
  _tenantid?: string; // ID da Organização (Campo Unificado)
  _unitid?: string;   // Unidade Operacional (Campo Unificado)
  GRUPO_EMPRESARIAL?: string; // Identificador da Empresa/Grupo
  UNIDADE_OPERACIONAL?: string; // Unidade Operacional
  ETIQUETA?: string;
  QT?: string | number;
  DESCRICAODOATIVO?: string;
  SERIAL?: string;
  DATAAQUISIC?: string;
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
  _lat?: number;
  _lng?: number;
  _aprovado?: boolean;
  _dataAprovacao?: string;
  _aprovador?: string;
  _assinatura?: string; // Base64 da assinatura
  _campaignId?: string; // ID da Campanha de Inventário
  _version?: number; // Controle de versão para concorrência otimista
  _is_deleted?: boolean; // Soft delete para auditoria
  _parent_id?: string | number; // ID do ativo pai em caso de unitarização
  _is_unitized?: boolean; // Indica se o ativo foi desmembrado/unitarizado
  _is_divergent_baixa?: boolean; // Regra de Ouro: ATIVO com DATABAIXA preenchida
  DE_PARA?: string;
  AUDITOR_STATUS_CONFERENCIA?: string;
  _origemTransacao?: TransactionOrigin;

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
  // Campos Teste de Impairment (CPC 01)
  _valor_recuperavel?: number;
  _valor_justo?: number;
  _valor_em_uso?: number;
  _perda_impairment?: number;
  _data_impairment?: string;
}

export interface NCMClassifier {
  id: string;
  ncm_code: string; // Código NCM
  description: string; // Descrição do Bem
  group_code: string; // Código do Grupo (4 dígitos)
  annual_depreciation_rate: number;
  useful_life_months: number;
  _tenantid: string;
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
  _tenantid: string;
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
  _tenantid: string;
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
  _tenantid: string;
}

export interface DepreciationHistory {
  id: string;
  asset_id: string;
  period_month: number;
  period_year: number;
  depreciation_value: number;
  accumulated_depreciation: number;
  residual_value: number;
  _tenantid: string;
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
  LOAD_DATABASE = 'LOAD_DATABASE',
  ASSET_DETAIL = 'ASSET_DETAIL',
  DASHBOARD = 'DASHBOARD',
  SETTINGS = 'SETTINGS',
  INVENTORY = 'INVENTORY',
  LABELING = 'LABELING', // Nova tela independente
  CONSULTATION = 'CONSULTATION',
  UNIT_SELECTION = 'UNIT_SELECTION',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
  FIELD_CONFIGURATOR = 'FIELD_CONFIGURATOR',
  QR_CODE_CONFIGURATOR = 'QR_CODE_CONFIGURATOR',
  QR_CONFIGURATOR = 'QR_CONFIGURATOR',
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
  STRESS_TEST = 'STRESS_TEST'
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
  CONTACONTABIL: string;
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
  _tenantid: string;
  _unitid?: string; // ID ou Nome da Unidade Operacional vinculada
  tenantid: string; // Deprecated: use _tenantid
  unit_id?: string; // Deprecated: use _unitid
  created_by: string;
  created_at: string;
  // Estatísticas calculadas
  total_assets?: number;
  inventoried_assets?: number;
  divergence_count?: number;
}

export interface UnitConfig {
  id?: string;
  _tenantid: string;
  _unitid: string; // Nome da unidade (ex: "MATRIZ")
  tenant_id: string; // Deprecated: use _tenantid
  unit_id: string; // Deprecated: use _unitid
  lat: number;
  lng: number;
  radius_meters: number;
  is_active: boolean;
  updated_at?: string;
  updated_by?: string;
}
