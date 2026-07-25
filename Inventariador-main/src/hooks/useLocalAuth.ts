import { useState, useCallback } from 'react';
import { authenticateLocalUser, AuthResult } from '../utils/authUtils';

/**
 * Hook that wraps authenticateLocalUser with optional React state management.
 *
 * When `manageState` is true (default):
 * - `authenticate(finder, email, password)` updates isLoading / error state
 * - `isLoading` tracks in-flight status
 * - `error` is set on failure, cleared on success or via clearError()
 * - `clearError()` resets the error
 *
 * When `manageState` is false, the hook returns stable false/null for
 * isLoading/error and never calls setState internally. Use this when the
 * consumer (e.g. Login.tsx) manages its own loading/error state and only
 * needs the stable useCallback wrapper for authenticateLocalUser.
 *
 * @param manageState - Whether to manage isLoading/error state (default true)
 */
export function useLocalAuth(manageState = true) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(
    async (
      findByEmail: (
        criteria: { email: string },
      ) => Promise<Record<string, unknown> | null | undefined>,
      email: string,
      password: string,
    ): Promise<AuthResult> => {
      if (manageState) {
        setIsLoading(true);
        setError(null);
      }

      const result = await authenticateLocalUser(findByEmail, email, password);

      if (manageState) {
        if (result.error) {
          setError(result.error);
        }
        setIsLoading(false);
      }

      return result;
    },
    [manageState],
  );

  const clearError = useCallback(() => {
    if (manageState) {
      setError(null);
    }
  }, [manageState]);

  return {
    authenticate,
    isLoading: manageState ? isLoading : false,
    error: manageState ? error : null,
    clearError,
  };
}
