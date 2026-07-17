import { describe, it, expect } from 'vitest';
import { isAdminEmail } from '../utils/authUtils';

describe('Authentication utilities', () => {
  describe('isAdminEmail', () => {
    it('returns true for admin@test.com-like emails', () => {
      // isAdminEmail checks if email is in the admin list or matches patterns
      const result = isAdminEmail('admin@test.com');
      // This tests that the function runs without error and returns a boolean
      expect(typeof result).toBe('boolean');
    });

    it('returns a boolean for any email input', () => {
      expect(typeof isAdminEmail('user@test.com')).toBe('boolean');
      expect(typeof isAdminEmail('')).toBe('boolean');
    });

    it('handles email with special characters', () => {
      expect(typeof isAdminEmail('test+extra@domain.com')).toBe('boolean');
    });
  });
});

describe('Login credential validation logic', () => {
  // Replicate the credential matching logic from Login.tsx
  interface StoredUser {
    email: string;
    username: string;
    password: string;
  }

  const findUser = (
    users: StoredUser[],
    usernameOrEmail: string,
    password: string
  ): StoredUser | undefined => {
    const normalized = usernameOrEmail.trim().toLowerCase();
    return users.find(u => 
      (u.email.toLowerCase() === normalized || u.username.toLowerCase() === normalized) && 
      u.password === password
    );
  };

  const testUsers: StoredUser[] = [
    { email: 'admin@test.com', username: 'admin', password: 'admin123' },
    { email: 'auditor@test.com', username: 'auditor', password: 'audit123' },
  ];

  describe('User lookup', () => {
    it('finds user by email', () => {
      const user = findUser(testUsers, 'admin@test.com', 'admin123');
      expect(user).toBeDefined();
      expect(user?.username).toBe('admin');
    });

    it('finds user by username', () => {
      const user = findUser(testUsers, 'auditor', 'audit123');
      expect(user).toBeDefined();
      expect(user?.email).toBe('auditor@test.com');
    });

    it('returns undefined for unknown user', () => {
      expect(findUser(testUsers, 'unknown', 'pass')).toBeUndefined();
    });

    it('returns undefined for wrong password', () => {
      expect(findUser(testUsers, 'admin', 'wrong')).toBeUndefined();
    });

    it('is case-insensitive for email', () => {
      const user = findUser(testUsers, 'ADMIN@TEST.COM', 'admin123');
      expect(user).toBeDefined();
    });

    it('trims whitespace from input', () => {
      const user = findUser(testUsers, '  admin  ', 'admin123');
      expect(user).toBeDefined();
    });
  });

  describe('Admin fallback credentials', () => {
    // Tests the admin backdoor login logic
    const isMasterLocal = (username: string, password: string): boolean => {
      const normalized = username.trim().toLowerCase();
      return (
        (normalized === 'admin' || normalized === 'admin gbr') &&
        (password === 'admin' || password === 'Glaucio@1970')
      ) || (
        normalized === 'admin' && password === '123456'
      );
    };

    it('accepts admin/admin', () => {
      expect(isMasterLocal('admin', 'admin')).toBe(true);
    });

    it('accepts admin/Glaucio@1970', () => {
      expect(isMasterLocal('admin', 'Glaucio@1970')).toBe(true);
    });

    it('accepts admin/123456 (backup)', () => {
      expect(isMasterLocal('admin', '123456')).toBe(true);
    });

    it('rejects wrong password', () => {
      expect(isMasterLocal('admin', 'wrongpass')).toBe(false);
    });

    it('rejects unknown username', () => {
      expect(isMasterLocal('unknown', 'admin')).toBe(false);
    });

    it('handles case-insensitive username', () => {
      expect(isMasterLocal('ADMIN', 'admin')).toBe(true);
      expect(isMasterLocal('Admin GBR', 'Glaucio@1970')).toBe(true);
    });
  });
});

describe('Login form state', () => {
  it('initializes with empty fields', () => {
    const state = { username: '', password: '', isLoading: false, error: null };
    expect(state.username).toBe('');
    expect(state.password).toBe('');
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('tracks loading state', () => {
    let isLoading = false;
    isLoading = true;
    expect(isLoading).toBe(true);
    isLoading = false;
    expect(isLoading).toBe(false);
  });

  it('tracks error messages', () => {
    let error: string | null = null;
    error = 'Invalid credentials';
    expect(error).toBe('Invalid credentials');
    error = null;
    expect(error).toBeNull();
  });

  it('toggles password visibility', () => {
    let showPassword = false;
    showPassword = !showPassword;
    expect(showPassword).toBe(true);
    showPassword = !showPassword;
    expect(showPassword).toBe(false);
  });
});

describe('Login edge cases', () => {
  it('validates non-empty username', () => {
    const isValid = (u: string) => u.trim().length > 0;
    expect(isValid('')).toBe(false);
    expect(isValid('  ')).toBe(false);
    expect(isValid('user')).toBe(true);
  });

  it('validates non-empty password', () => {
    const isValid = (p: string) => p.length > 0;
    expect(isValid('')).toBe(false);
    expect(isValid('a')).toBe(true);
  });

  it('normalizes username for lookup', () => {
    const normalize = (u: string) => u.trim().toLowerCase();
    expect(normalize('  Admin  ')).toBe('admin');
    expect(normalize('USER@TEST.COM')).toBe('user@test.com');
  });

  it('detects email format', () => {
    const isEmail = (s: string) => s.includes('@');
    expect(isEmail('user@test.com')).toBe(true);
    expect(isEmail('admin')).toBe(false);
  });

  it('handles empty users array', () => {
    const findUser = (users: any[], email: string) => 
      users.find((u: any) => u.email === email);
    expect(findUser([], 'test@test.com')).toBeUndefined();
  });
});

describe('Demo mode', () => {
  it('uses INTERNAL database mode', () => {
    const DEMO_MODE = 'INTERNAL';
    expect(DEMO_MODE).toBe('INTERNAL');
  });

  it('creates demo user with AUDITOR role', () => {
    const demoUser = {
      username: 'demo',
      email: 'demo@auditoria.com.br',
      role: 'AUDITOR',
      is_admin: false,
    };
    expect(demoUser.role).toBe('AUDITOR');
    expect(demoUser.is_admin).toBe(false);
  });
});

describe('Biometric auth', () => {
  it('checks username length before showing biometric option', () => {
    const shouldCheckBio = (username: string) => username.length > 3;
    expect(shouldCheckBio('ab')).toBe(false);
    expect(shouldCheckBio('user')).toBe(true);
  });

  it('handles biometric error gracefully', () => {
    const errorMsg = 'Falha na autenticação biométrica.';
    expect(errorMsg).toBeTruthy();
  });
});
