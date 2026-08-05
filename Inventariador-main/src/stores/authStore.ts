import { create } from 'zustand';
import { User, UserRole } from '../types';

export interface AuthState {
  /** Current authenticated user */
  user: User | null;
  /** Whether the Supabase/cloud session is valid */
  isSessionValid: boolean;
  /** Whether the engine (SQLite/Dexie) is fully initialized */
  isEngineReady: boolean;
  /** Whether inventory data has been loaded */
  isDataLoaded: boolean;
  /** Whether the database connection is established */
  isDatabaseLoaded: boolean;
  /** Loading state for authentication checks */
  authLoading: boolean;

  // Computed helpers (stored for convenience — consumers derive these too)
  isProfileLocal: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setIsSessionValid: (valid: boolean) => void;
  setIsEngineReady: (ready: boolean) => void;
  setIsDataLoaded: (loaded: boolean) => void;
  setIsDatabaseLoaded: (loaded: boolean) => void;
  setAuthLoading: (loading: boolean) => void;

  /** Reset all auth state (logout) */
  reset: () => void;
}

const initialState = {
  user: null as User | null,
  isSessionValid: false,
  isEngineReady: false,
  isDataLoaded: false,
  isDatabaseLoaded: false,
  authLoading: true,
  isProfileLocal: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setUser: (user) => {
    const isProfileLocal = user
      ? (() => {
          const lowerEmail = (user.email || '').toLowerCase();
          const lowerUsername = (user.username || '').toLowerCase();
          return (
            lowerUsername === 'admin' ||
            lowerUsername === 'semorr' ||
            user.role === 'DEMO' ||
            lowerEmail === 'semorr@gmail.com' ||
            user.role === 'ADMIN' ||
            user.role === 'MASTER' ||
            user.role === 'MOBILE_SINGLE'
          );
        })()
      : false;
    set({ user, isProfileLocal });
  },

  setIsSessionValid: (isSessionValid) => set({ isSessionValid }),
  setIsEngineReady: (isEngineReady) => set({ isEngineReady }),
  setIsDataLoaded: (isDataLoaded) => set({ isDataLoaded }),
  setIsDatabaseLoaded: (isDatabaseLoaded) => set({ isDatabaseLoaded }),
  setAuthLoading: (authLoading) => set({ authLoading }),

  reset: () => set({ ...initialState }),
}));

/**
 * Convenience selector — whether the current user is authenticated
 * considering both session validity and local profile sovereignty.
 */
export function useIsAuthenticated(): boolean {
  const user = useAuthStore((s) => s.user);
  const isSessionValid = useAuthStore((s) => s.isSessionValid);
  const isProfileLocal = useAuthStore((s) => s.isProfileLocal);

  // Mirror of App.tsx's isSessionCurrentlyValid / isUserAuthenticated
  const isCurrentlyValid =
    isSessionValid || isProfileLocal || (user?.role === ('DEMO' as unknown as UserRole));
  return !!user && isCurrentlyValid;
}
