import { create } from 'zustand';
import {
  AppScreen,
  AppModule,
  DatabaseMode,
  ModalConfig,
  NavigationParams,
  SearchFilters,
  ScannerMode,
} from '../types';

export interface FileStatus {
  status: string;
  path: string;
  folderName?: string;
  fileName?: string;
  linkType?: string;
}

export interface SqliteStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  status: string;
}

export interface UiStoreState {
  // Navigation
  screen: AppScreen;
  history: AppScreen[];
  screenParams: NavigationParams | null;

  // Modal
  modalConfig: ModalConfig;

  // Database mode
  databaseMode: DatabaseMode;

  // Feature flags & panels
  isPrivacyCenterOpen: boolean;
  isPaletteOpen: boolean;
  isAIAssistantOpen: boolean;
  isHelpMenuOpen: boolean;
  isSafeMode: boolean;
  securityThreats: string[];
  isFieldMode: boolean;
  isFullscreen: boolean;
  isKeyboardVisible: boolean;
  permissionsGranted: boolean;
  showAccessRequest: boolean;
  isProcessing: boolean;
  bootstrapError: Error | null;

  // Initialization & loading
  isInitializing: boolean;
  dbInitialized: boolean;
  isLoading: boolean;
  isEngineReady: boolean;

  // Address
  selectedAddress: string | null;

  // Recovery / integrity
  showRecoveryToast: boolean;
  recoverySource: 'PHYSICAL' | 'CACHE' | 'LEGACY' | 'CLOUD' | null;
  integrityFailed: boolean;

  // File / SQLite status
  fileStatus: FileStatus | null;
  sqliteStatus: SqliteStatus;

  // Consultation
  consultationFilters: SearchFilters;
  committedConsultationFilters: SearchFilters | null;
  isConsultationFromInventory: boolean;
  startWithDataMenu: boolean;

  // Public asset
  publicAsset: unknown | null;
  manualLocations: string[];
  currentModule: AppModule | null;

  // Actions — Navigation
  setScreen: (screen: AppScreen) => void;
  setHistory: (history: AppScreen[]) => void;
  setScreenParams: (params: NavigationParams | null) => void;
  pushScreen: (screen: AppScreen, params?: NavigationParams) => void;
  goBack: () => void;

  // Actions — Modal
  setModalConfig: (config: ModalConfig | Partial<ModalConfig>) => void;
  showModal: (
    title: string,
    message: string,
    type: ModalConfig['type'],
  ) => void;
  closeModal: () => void;

  // Actions — Flags
  setDatabaseMode: (mode: DatabaseMode) => void;
  setIsPrivacyCenterOpen: (open: boolean) => void;
  setIsPaletteOpen: (open: boolean) => void;
  setIsAIAssistantOpen: (open: boolean) => void;
  setIsHelpMenuOpen: (open: boolean) => void;
  setIsSafeMode: (safe: boolean) => void;
  setSecurityThreats: (threats: string[]) => void;
  setIsFieldMode: (mode: boolean) => void;
  setIsFullscreen: (fs: boolean) => void;
  setIsKeyboardVisible: (visible: boolean) => void;
  setPermissionsGranted: (granted: boolean) => void;
  setShowAccessRequest: (show: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  setBootstrapError: (error: Error | null) => void;
  setIsInitializing: (init: boolean) => void;
  setDbInitialized: (init: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedAddress: (addr: string | null) => void;
  setShowRecoveryToast: (show: boolean) => void;
  setRecoverySource: (
    source: UiStoreState['recoverySource'],
  ) => void;
  setIntegrityFailed: (failed: boolean) => void;
  setFileStatus: (status: FileStatus | null) => void;
  setSqliteStatus: (status: Partial<SqliteStatus> | string) => void;
  setConsultationFilters: (filters: SearchFilters) => void;
  setCommittedConsultationFilters: (
    filters: SearchFilters | null,
  ) => void;
  setIsConsultationFromInventory: (from: boolean) => void;
  setStartWithDataMenu: (start: boolean) => void;
  setPublicAsset: (asset: unknown | null) => void;
  setCurrentModule: (module: AppModule | null) => void;

  reset: () => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  ETIQUETA: '',
  DESCRICAODOATIVO: '',
  SERIAL: '',
  CNPJ: '',
  NOMEFORNECEDOR: '',
  NOTAFISCAL: '',
  ENDERECO: '',
  conta_contabil: '',
  CENTRODECUSTO: '',
  DATAAQUISIC_START: '',
  DATAAQUISIC_END: '',
  Sn1_recno: '',
  Sn3_recno: '',
};

function getSqliteStatus(): SqliteStatus {
  const rawFilial =
    sessionStorage.getItem('filial') || sessionStorage.getItem('selectedUnit');
  const storedFilial = rawFilial
    ? rawFilial.replace(/%22|%2522|"/g, '').trim()
    : '';
  const hasFilial =
    storedFilial && storedFilial !== 'CARREGANDO...' && storedFilial !== '';
  return {
    connected: !!hasFilial,
    loading: !hasFilial,
    error: null,
    status: hasFilial ? 'ACTIVE' : 'EMPTY',
  };
}

function getSavedFilters(): SearchFilters {
  try {
    const saved = localStorage.getItem('app_consultation_filters');
    return saved ? JSON.parse(saved) : { ...DEFAULT_FILTERS };
  } catch {
    return { ...DEFAULT_FILTERS };
  }
}

function getCommittedFilters(): SearchFilters | null {
  try {
    const saved = localStorage.getItem('app_committed_consultation_filters');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function getSavedModule(): AppModule | null {
  const saved = localStorage.getItem('app_current_module');
  return (saved as AppModule) || null;
}

const savedDbMode = localStorage.getItem('app_database_mode') as DatabaseMode | null;

const initialState: UiStoreState = {
  screen: AppScreen.LOGIN,
  history: [AppScreen.LOGIN],
  screenParams: null,
  modalConfig: { isOpen: false, title: '', message: '', type: 'info' },
  databaseMode: savedDbMode || DatabaseMode.INTERNAL,
  isPrivacyCenterOpen: false,
  isPaletteOpen: false,
  isAIAssistantOpen: false,
  isHelpMenuOpen: false,
  isSafeMode: true,
  securityThreats: [],
  isFieldMode: localStorage.getItem('app_field_mode') === 'true',
  isFullscreen: false,
  isKeyboardVisible: false,
  permissionsGranted: true,
  showAccessRequest: false,
  isProcessing: false,
  bootstrapError: null,
  isInitializing: true,
  dbInitialized: false,
  isLoading: false,
  isEngineReady: false,
  selectedAddress: sessionStorage.getItem('current_selected_address') || null,
  showRecoveryToast: false,
  recoverySource: null,
  integrityFailed: false,
  fileStatus: null,
  sqliteStatus: getSqliteStatus(),
  consultationFilters: getSavedFilters(),
  committedConsultationFilters: getCommittedFilters(),
  isConsultationFromInventory: false,
  startWithDataMenu: false,
  publicAsset: null,
  manualLocations: JSON.parse(
    localStorage.getItem('app_manual_locations') || '[]',
  ),
  currentModule: getSavedModule(),
};

export const useUiStore = create<UiStoreState>((set, get) => ({
  ...initialState,

  // Navigation
  setScreen: (screen) => set({ screen }),
  setHistory: (history) => {
    const targetScreen = history[history.length - 1] || AppScreen.LOGIN;
    localStorage.setItem('app_screen_history', JSON.stringify(history));
    localStorage.setItem('gbr_kardek_history', JSON.stringify(history));
    set({ history, screen: targetScreen });
  },
  setScreenParams: (screenParams) => set({ screenParams }),
  pushScreen: (screen, params) => {
    set((state) => {
      const newHistory =
        screen === AppScreen.LOGIN || screen === AppScreen.MAIN_MENU
          ? [screen]
          : [...state.history, screen];
      localStorage.setItem('gbr_kardek_history', JSON.stringify(newHistory));
      return {
        screen,
        screenParams: params || null,
        history: newHistory,
      };
    });
  },
  goBack: () => {
    set((state) => {
      if (state.history.length <= 1) return state;
      const newHistory = state.history.slice(0, -1);
      const prevScreen = newHistory[newHistory.length - 1];
      localStorage.setItem('gbr_kardek_history', JSON.stringify(newHistory));
      return { history: newHistory, screen: prevScreen };
    });
  },

  // Modal
  setModalConfig: (config) =>
    set((state) => ({
      modalConfig: { ...state.modalConfig, ...config },
    })),
  showModal: (title, message, type) =>
    set({ modalConfig: { isOpen: true, title, message, type } }),
  closeModal: () =>
    set((state) => ({
      modalConfig: { ...state.modalConfig, isOpen: false },
    })),

  // Flags
  setDatabaseMode: (databaseMode) => {
    localStorage.setItem('app_database_mode', databaseMode);
    set({ databaseMode });
  },
  setIsPrivacyCenterOpen: (isPrivacyCenterOpen) => set({ isPrivacyCenterOpen }),
  setIsPaletteOpen: (isPaletteOpen) => set({ isPaletteOpen }),
  setIsAIAssistantOpen: (isAIAssistantOpen) => set({ isAIAssistantOpen }),
  setIsHelpMenuOpen: (isHelpMenuOpen) => set({ isHelpMenuOpen }),
  setIsSafeMode: (isSafeMode) => set({ isSafeMode }),
  setSecurityThreats: (securityThreats) => set({ securityThreats }),
  setIsFieldMode: (isFieldMode) => {
    localStorage.setItem('app_field_mode', String(isFieldMode));
    set({ isFieldMode });
  },
  setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
  setIsKeyboardVisible: (isKeyboardVisible) => set({ isKeyboardVisible }),
  setPermissionsGranted: (permissionsGranted) => set({ permissionsGranted }),
  setShowAccessRequest: (showAccessRequest) => set({ showAccessRequest }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setBootstrapError: (bootstrapError) => set({ bootstrapError }),
  setIsInitializing: (isInitializing) => set({ isInitializing }),
  setDbInitialized: (dbInitialized) => set({ dbInitialized }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setSelectedAddress: (addr) => {
    if (addr) {
      sessionStorage.setItem('current_selected_address', addr);
    } else {
      sessionStorage.removeItem('current_selected_address');
    }
    set({ selectedAddress: addr });
  },
  setShowRecoveryToast: (showRecoveryToast) => set({ showRecoveryToast }),
  setRecoverySource: (recoverySource) => set({ recoverySource }),
  setIntegrityFailed: (integrityFailed) => set({ integrityFailed }),
  setFileStatus: (fileStatus) => set({ fileStatus }),
  setSqliteStatus: (val) =>
    set((state) => {
      if (typeof val === 'string') {
        const isConnected = val === 'ACTIVE';
        return {
          sqliteStatus: {
            ...state.sqliteStatus,
            status: val,
            connected: isConnected,
            loading: false,
          },
        };
      }
      return {
        sqliteStatus: { ...state.sqliteStatus, ...val },
      };
    }),
  setConsultationFilters: (consultationFilters) => {
    localStorage.setItem(
      'app_consultation_filters',
      JSON.stringify(consultationFilters),
    );
    set({ consultationFilters });
  },
  setCommittedConsultationFilters: (committedConsultationFilters) => {
    if (committedConsultationFilters) {
      localStorage.setItem(
        'app_committed_consultation_filters',
        JSON.stringify(committedConsultationFilters),
      );
    } else {
      localStorage.removeItem('app_committed_consultation_filters');
    }
    set({ committedConsultationFilters });
  },
  setIsConsultationFromInventory: (isConsultationFromInventory) =>
    set({ isConsultationFromInventory }),
  setStartWithDataMenu: (startWithDataMenu) => set({ startWithDataMenu }),
  setPublicAsset: (publicAsset) => set({ publicAsset }),
  setCurrentModule: (currentModule) => {
    localStorage.setItem('app_current_module', String(currentModule || ''));
    set({ currentModule });
  },

  reset: () => set({ ...initialState, sqliteStatus: getSqliteStatus() }),
}));
