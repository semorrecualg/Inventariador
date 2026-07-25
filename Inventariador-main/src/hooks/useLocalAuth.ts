import { useState, useCallback } from 'react';
import { authenticateLocalUser, AuthResult } from '../utils/authUtils';

/**
 * Hook that wraps authenticateLocalUser with React state management.
 *
 * Provides:
 * - `authenticate(finder, email, password)` — performs the auth and
 *   updates isLoading / error state automatically
 * - `isLoading` — true while the async auth is in flight
 * - `error` — string | null, set on auth failure, cleared on success
 *   or by calling clearError()
 * - `clearError()` — manually resets the error state
 */
export function useLocalAuth() {
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
      setIsLoading(true);
      setError(null);

      const result = await authenticateLocalUser(findByEmail, email, password);

      if (result.error) {
        setError(result.error);
      }

      setIsLoading(false);
      return result;
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { authenticate, isLoading, error, clearError };
}
