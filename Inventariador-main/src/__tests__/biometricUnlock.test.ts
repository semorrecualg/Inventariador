import { describe, it, expect } from 'vitest';
import {
  canOfferBiometricUnlock,
  forgetLastLoginUser,
  readLastLoginUser,
  rememberLastLoginUser,
  type UnlockStorage
} from '../utils/biometricUnlock';

/** Storage em memória — o ambiente `node` do Vitest não tem localStorage. */
const memoryStorage = (): UnlockStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
};

describe('desbloqueio biométrico — último utilizador do aparelho', () => {
  it('memoriza o utilizador em minúsculas e lê-o de volta', () => {
    const storage = memoryStorage();
    expect(rememberLastLoginUser({ username: '  Auditor.GO ' }, storage)).toBe('auditor.go');
    expect(readLastLoginUser(storage)).toBe('auditor.go');
  });

  it('cai para o e-mail quando não há username', () => {
    const storage = memoryStorage();
    expect(rememberLastLoginUser({ email: 'Chefe@GBR.com' }, storage)).toBe('chefe@gbr.com');
    expect(readLastLoginUser(storage)).toBe('chefe@gbr.com');
  });

  it('não memoriza o perfil DEMO nem identificadores vazios', () => {
    const storage = memoryStorage();
    rememberLastLoginUser({ username: 'auditor' }, storage);

    expect(rememberLastLoginUser({ username: 'demo', role: 'DEMO' }, storage)).toBe('');
    expect(rememberLastLoginUser({ username: '   ' }, storage)).toBe('');
    expect(rememberLastLoginUser(null, storage)).toBe('');
    // O último utilizador REAL do aparelho não é substituído pelo demo.
    expect(readLastLoginUser(storage)).toBe('auditor');
  });

  it('esquece o utilizador a pedido', () => {
    const storage = memoryStorage();
    rememberLastLoginUser({ username: 'auditor' }, storage);
    forgetLastLoginUser(storage);
    expect(readLastLoginUser(storage)).toBe('');
  });

  it('sem storage não rebenta e não guarda nada', () => {
    expect(rememberLastLoginUser({ username: 'auditor' }, null)).toBe('');
    expect(readLastLoginUser(null)).toBe('');
    expect(() => forgetLastLoginUser(null)).not.toThrow();
  });
});

describe('canOfferBiometricUnlock — desbloqueio só onde o aparelho verifica', () => {
  const base = {
    lastUser: 'auditor',
    isNativeApp: true,
    biometry: 'available' as const,
    registered: true
  };

  it('casco nativo com biometria e credencial do último utilizador → desbloqueio', () => {
    expect(canOfferBiometricUnlock(base)).toBe(true);
  });

  it('web sem autenticador → continua utilizador e senha', () => {
    expect(canOfferBiometricUnlock({ ...base, isNativeApp: false })).toBe(false);
    expect(
      canOfferBiometricUnlock({ ...base, isNativeApp: false, biometry: 'unknown', registered: false })
    ).toBe(false);
  });

  it('primeiro acesso (sem credencial) → senha e cadastro obrigatório', () => {
    expect(canOfferBiometricUnlock({ ...base, registered: false })).toBe(false);
  });

  it('aparelho sem biometria ou plugin sem resposta → sem desbloqueio', () => {
    expect(canOfferBiometricUnlock({ ...base, biometry: 'unavailable' })).toBe(false);
    expect(canOfferBiometricUnlock({ ...base, biometry: 'unknown' })).toBe(false);
  });

  it('sem último utilizador não há quem desbloquear', () => {
    expect(canOfferBiometricUnlock({ ...base, lastUser: '' })).toBe(false);
  });
});
