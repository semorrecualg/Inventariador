import { create } from 'zustand';

export interface SyncStoreState {
  /** Number of items in the sync queue */
  syncQueueLength: number;
  /** Number of unsynced assets */
  unsyncedAssetsCount: number;
  /** Whether the sync engine is locked (queue exceeded safe limit) */
  isSyncLocked: boolean;
  /** Whether a sync operation is currently running */
  isSyncing: boolean;
  /** ISO timestamp of the last successful sync */
  lastSyncTime: string | null;
  /** ISO timestamp of the last local save */
  lastLocalSave: string | null;
  /** Last sync error message */
  syncError: string | null;
  /** Whether there is a pending cloud update */
  isCloudUpdatePending: boolean;
  /** Whether a reconnection attempt is in progress */
  isReconnecting: boolean;
  /** Whether to show the reconnect overlay */
  showReconnectOverlay: boolean;
  /** Counter to force re-render of sync-dependent components */
  refreshVersion: number;
  /** Number of photos pending upload */
  pendingPhotosCount: number;
  /** Last query log entry */
  lastQueryLog: string | null;

  // Actions
  setSyncQueueLength: (len: number) => void;
  setUnsyncedAssetsCount: (count: number) => void;
  setIsSyncLocked: (locked: boolean) => void;
  setIsSyncing: (syncing: boolean) => void;
  setLastSyncTime: (time: string | null) => void;
  setLastLocalSave: (time: string | null) => void;
  setSyncError: (error: string | null) => void;
  setIsCloudUpdatePending: (pending: boolean) => void;
  setIsReconnecting: (reconnecting: boolean) => void;
  setShowReconnectOverlay: (show: boolean) => void;
  setRefreshVersion: (v: number) => void;
  setPendingPhotosCount: (count: number) => void;
  setLastQueryLog: (log: string | null) => void;
  /** Increment refresh version to trigger re-renders */
  bumpRefreshVersion: () => void;
  reset: () => void;
}

const initialState: Omit<SyncStoreState, 'setSyncQueueLength' | 'setUnsyncedAssetsCount' | 'setIsSyncLocked' | 'setIsSyncing' | 'setLastSyncTime' | 'setLastLocalSave' | 'setSyncError' | 'setIsCloudUpdatePending' | 'setIsReconnecting' | 'setShowReconnectOverlay' | 'setRefreshVersion' | 'setPendingPhotosCount' | 'setLastQueryLog' | 'bumpRefreshVersion' | 'reset'> = {
  syncQueueLength: 0,
  unsyncedAssetsCount: 0,
  isSyncLocked: false,
  isSyncing: false,
  lastSyncTime: null,
  lastLocalSave: null,
  syncError: null,
  isCloudUpdatePending: false,
  isReconnecting: false,
  showReconnectOverlay: false,
  refreshVersion: 0,
  pendingPhotosCount: 0,
  lastQueryLog: null,
};

export const useSyncStore = create<SyncStoreState>((set) => ({
  ...initialState,

  setSyncQueueLength: (syncQueueLength) => set({ syncQueueLength }),
  setUnsyncedAssetsCount: (unsyncedAssetsCount) => set({ unsyncedAssetsCount }),
  setIsSyncLocked: (isSyncLocked) => set({ isSyncLocked }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
  setLastLocalSave: (lastLocalSave) => set({ lastLocalSave }),
  setSyncError: (syncError) => set({ syncError }),
  setIsCloudUpdatePending: (isCloudUpdatePending) => set({ isCloudUpdatePending }),
  setIsReconnecting: (isReconnecting) => set({ isReconnecting }),
  setShowReconnectOverlay: (showReconnectOverlay) => set({ showReconnectOverlay }),
  setRefreshVersion: (refreshVersion) => set({ refreshVersion }),
  setPendingPhotosCount: (pendingPhotosCount) => set({ pendingPhotosCount }),
  setLastQueryLog: (lastQueryLog) => set({ lastQueryLog }),
  bumpRefreshVersion: () =>
    set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
  reset: () => set({ ...initialState }),
}));
