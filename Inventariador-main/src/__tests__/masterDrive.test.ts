import { describe, it, expect } from 'vitest';
import { checkMasterDrive } from '../utils/authUtils';

describe('MASTER_DRIVE — checkMasterDrive', () => {
  // ── Cenário 1: Sucesso ──
  it('returns masterUser for Glaucio@1970 + admin (sucesso)', () => {
    const result = checkMasterDrive('Glaucio@1970', 'admin');

    expect(result.isMaster).toBe(true);
    expect(result.masterUser).toBeDefined();
    expect(result.masterUser?.role).toBe('ADMIN');
    expect(result.masterUser?.email).toBe('semorr@gmail.com');
    expect(result.masterUser?.tenantid).toBe('');
    expect(result.masterUser?.filial).toBe('TODAS');
  });

  // ── Cenário 2: Senha errada ──
  it('returns isMaster=false for wrong password (senha errada)', () => {
    const result = checkMasterDrive('Glaucio@1970', 'wrongpassword');

    expect(result.isMaster).toBe(false);
    expect(result.masterUser).toBeUndefined();
  });

  // ── Cenário 3: Trim de espaços ──
  it('trims whitespace from username before comparison (trim)', () => {
    const result = checkMasterDrive('  Glaucio@1970  ', 'admin');

    expect(result.isMaster).toBe(true);
    expect(result.masterUser).toBeDefined();
  });

  // ── Cenário 4: Pureza — sem sessionStorage (a função não tem side effects) ──
  it('returns a new object each call (pure function — no shared state)', () => {
    const result1 = checkMasterDrive('Glaucio@1970', 'admin');
    const result2 = checkMasterDrive('Glaucio@1970', 'admin');

    // Cada chamada retorna um objeto novo, não uma referência compartilhada
    expect(result1).not.toBe(result2);
    expect(result1).toEqual(result2);

    // Modificar o resultado de uma chamada não afeta a outra
    (result1 as { modified?: boolean }).modified = true;
    expect((result2 as { modified?: boolean }).modified).toBeUndefined();
  });

  // ── Cenário extra: Case sensitivity ──
  it('is case-sensitive for username (Glaucio@1970 com case diferente)', () => {
    const result = checkMasterDrive('glaucio@1970', 'admin');
    // MASTER_DRIVE é case-sensitive — 'glaucio@1970' !== 'Glaucio@1970'
    expect(result.isMaster).toBe(false);
  });

  // ── Cenário extra: Vazio ──
  it('returns false for empty username', () => {
    const result = checkMasterDrive('', 'admin');
    expect(result.isMaster).toBe(false);
  });

  it('returns false for null password', () => {
    const result = checkMasterDrive('Glaucio@1970', '');
    expect(result.isMaster).toBe(false);
  });
});
