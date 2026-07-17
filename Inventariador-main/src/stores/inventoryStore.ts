import { create } from 'zustand';
import {
  Asset,
  InventoryState,
  DatabaseStatus,
  ScannerMode,
  ScanFeedbackMode,
  InventorySearchMode,
  DatabaseMode,
  InventoryCampaign,
  UnitConfig,
  SearchFilters,
  User,
} from '../types';

export interface InventoryStoreState {
  /** Full inventory state (assets, companies, settings) */
  inventory: InventoryState;
  /** Currently selected operating unit */
  selectedUnit: string | null;
  /** List of campaigns for the current tenant */
  campaigns: InventoryCampaign[];
  /** Geofencing configs per unit */
  unitConfigs: UnitConfig[];
  /** Legacy alias for selectedUnit */
  currentUnit: string | null;
  /** Assets pre-filtered for the active unit */
  sqliteUnitAssets: Asset[];
  /** Count of assets in the active unit */
  activeUnitAssetCount: number;
  /** Dashboard aggregate stats from SQLite */
  sqlDashboardStats: {
    totalAtivos: number;
    conferidoAtivos: number;
    baixadosLocalizados: number;
    totalLido: number;
    pendentesAtivos: number;
    avancoPercent: number;
  } | null;
  /** Whether the database has zero assets */
  isDatabaseEmpty: boolean;
  /** Operational unit metadata from SQLite */
  sqliteOperationalUnits: Array<{
    filial: string;
    displayName: string;
    total: number;
    checked: number;
  }>;
  /** Stored inventory location label */
  inventoryLocation: string | null;
  /** Whether an inventory session is active */
  isInventorying: boolean;
  /** Currently selected assets (for batch operations) */
  selectedAssets: Asset[];
  /** Asset awaiting update confirmation */
  pendingAssetUpdate: Asset | null;
  /** Duplicate detection modal */
  isDuplicateModalOpen: boolean;
  duplicateModalMessage: string;
  /** Read-only mode for asset detail */
  isReadOnlyDetail: boolean;
  /** Import batch flag */
  isImportingBatchState: boolean;
  /** User list (shared with auth, but managed here for historical reasons) */
  users: User[];
  /** Whether users have been fetched from cloud */
  hasFetchedUsers: boolean;

  // Actions
  setInventory: (inv: Partial<InventoryState> | InventoryState) => void;
  setSelectedUnit: (unit: string | null) => void;
  setCampaigns: (campaigns: InventoryCampaign[]) => void;
  setUnitConfigs: (configs: UnitConfig[]) => void;
  setCurrentUnit: (unit: string | null) => void;
  setSqliteUnitAssets: (assets: Asset[]) => void;
  setActiveUnitAssetCount: (count: number) => void;
  setSqlDashboardStats: (
    stats: InventoryStoreState['sqlDashboardStats'],
  ) => void;
  setIsDatabaseEmpty: (empty: boolean) => void;
  setSqliteOperationalUnits: (
    units: InventoryStoreState['sqliteOperationalUnits'],
  ) => void;
  setInventoryLocation: (loc: string | null) => void;
  setIsInventorying: (inv: boolean) => void;
  setSelectedAssets: (assets: Asset[]) => void;
  setPendingAssetUpdate: (asset: Asset | null) => void;
  setDuplicateModal: (open: boolean, message?: string) => void;
  setIsReadOnlyDetail: (ro: boolean) => void;
  setIsImportingBatchState: (importing: boolean) => void;
  setUsers: (users: User[]) => void;
  setHasFetchedUsers: (fetched: boolean) => void;
  reset: () => void;
}

const getInitialInventoryState = (mode: DatabaseMode): InventoryState => ({
  assets: [],
  companies: [],
  lastUpdated: null,
  status: DatabaseStatus.EMPTY,
  editableFields: ['DESCRICAODOATIVO', 'SERIAL', 'ENDERECO'],
  qrCodeFields: ['ETIQUETA'],
  scannerMode: ScannerMode.BARCODE,
  autoConfirmOnScan: false,
  scanFeedbackMode: ScanFeedbackMode.BOTH,
  inventorySearchMode: InventorySearchMode.MANUAL,
  immersiveMode: false,
  darkMode: localStorage.getItem('app_dark_mode') === 'true',
  batterySaver: localStorage.getItem('app_battery_saver') === 'true',
  protheusIntegrationEnabled:
    localStorage.getItem('app_protheus_enabled') === 'true',
  protheusApiUrl: localStorage.getItem('app_protheus_url') || '',
  mandatoryPhotoOnDivergence:
    localStorage.getItem('app_mandatory_photo_divergence') === 'true',
  mandatoryPhotoOnNewItem:
    localStorage.getItem('app_mandatory_photo_new') === 'true',
  excludedAccounts: JSON.parse(
    localStorage.getItem('app_excluded_accounts') || '[]',
  ),
  databaseMode: mode,
  hasCompletedOnboarding:
    localStorage.getItem('app_onboarding_completed') === 'true',
});

const savedMode = localStorage.getItem('app_database_mode') as DatabaseMode | null;
const initialMode = savedMode || DatabaseMode.INTERNAL;

const initialState: InventoryStoreState = {
  inventory: getInitialInventoryState(initialMode),
  selectedUnit: null,
  campaigns: [],
  unitConfigs: [],
  currentUnit: localStorage.getItem('app_current_unit') || localStorage.getItem('app_selected_unit') || null,
  sqliteUnitAssets: [],
  activeUnitAssetCount: 0,
  sqlDashboardStats: null,
  isDatabaseEmpty: false,
  sqliteOperationalUnits: [],
  inventoryLocation: localStorage.getItem('app_inventory_location') || null,
  isInventorying: localStorage.getItem('app_is_inventorying') === 'true',
  selectedAssets: [],
  pendingAssetUpdate: null,
  isDuplicateModalOpen: false,
  duplicateModalMessage: '',
  isReadOnlyDetail: false,
  isImportingBatchState: false,
  users: [],
  hasFetchedUsers: false,
};

export const useInventoryStore = create<InventoryStoreState>((set) => ({
  ...initialState,

  setInventory: (inv) =>
    set((state) => {
      if ('assets' in inv || 'companies' in inv || 'status' in inv) {
        return { inventory: { ...state.inventory, ...inv } };
      }
      return { inventory: inv as InventoryState };
    }),

  setSelectedUnit: (selectedUnit) => set({ selectedUnit }),
  setCampaigns: (campaigns) => set({ campaigns }),
  setUnitConfigs: (unitConfigs) => set({ unitConfigs }),
  setCurrentUnit: (currentUnit) => set({ currentUnit }),
  setSqliteUnitAssets: (sqliteUnitAssets) => set({ sqliteUnitAssets }),
  setActiveUnitAssetCount: (activeUnitAssetCount) => set({ activeUnitAssetCount }),
  setSqlDashboardStats: (sqlDashboardStats) => set({ sqlDashboardStats }),
  setIsDatabaseEmpty: (isDatabaseEmpty) => set({ isDatabaseEmpty }),
  setSqliteOperationalUnits: (sqliteOperationalUnits) =>
    set({ sqliteOperationalUnits }),
  setInventoryLocation: (inventoryLocation) => set({ inventoryLocation }),
  setIsInventorying: (isInventorying) => set({ isInventorying }),
  setSelectedAssets: (selectedAssets) => set({ selectedAssets }),
  setPendingAssetUpdate: (pendingAssetUpdate) => set({ pendingAssetUpdate }),
  setDuplicateModal: (isDuplicateModalOpen, message) =>
    set({ isDuplicateModalOpen, duplicateModalMessage: message ?? '' }),
  setIsReadOnlyDetail: (isReadOnlyDetail) => set({ isReadOnlyDetail }),
  setIsImportingBatchState: (isImportingBatchState) => set({ isImportingBatchState }),
  setUsers: (users) => set({ users }),
  setHasFetchedUsers: (hasFetchedUsers) => set({ hasFetchedUsers }),

  reset: () => set({ ...initialState }),
}));
