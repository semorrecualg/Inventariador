import { describe, it, expect } from 'vitest';
import {
  validateStrongPassword,
  validateQuickLoginPassword,
  passwordScore,
  STRONG_PASSWORD_MIN_LENGTH,
} from '../utils/passwordPolicy';

describe('passwordPolicy — senha FORTE (MASTER / provisionamento de licença)', () => {
  it('aceita senha com 8+ chars, maiúscula, minúscula, número e especial', () => {
    const r = validateStrongPassword('Licenca#2026');
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.score).toBe(5);
  });

  it('rejeita senha curta', () => {
    const r = validateStrongPassword('Ab1!x');
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Mínimo'))).toBe(true);
  });

  it('rejeita sem maiúscula, sem número e sem especial', () => {
    const r = validateStrongPassword('abcdefgh');
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Pelo menos uma letra maiúscula');
    expect(r.errors).toContain('Pelo menos um número');
    expect(r.errors).toContain('Pelo menos um caractere especial');
  });

  it('rejeita vazia e reporta todas as 5 regras', () => {
    const r = validateStrongPassword('');
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(5);
    expect(r.score).toBe(0);
  });

  it('passwordScore conta regras atendidas', () => {
    expect(passwordScore('Ab1!x234')).toBe(5);
    expect(passwordScore('abcdefgh')).toBe(2); // minúscula + comprimento
    expect(passwordScore('')).toBe(0);
  });

  it('limite mínimo é 8', () => {
    expect(STRONG_PASSWORD_MIN_LENGTH).toBe(8);
    expect(validateStrongPassword('Ab1!x234').valid).toBe(true); // exatamente 8
    expect(validateStrongPassword('Ab1!x23').valid).toBe(false); // 7
  });
});

describe('passwordPolicy — senha LEVE (sub-usuário de login rápido)', () => {
  it('aceita senha com mínimo de 6, letra e número', () => {
    const r = validateQuickLoginPassword('opera23');
    expect(r.valid).toBe(true);
  });

  it('rejeita muito curta', () => {
    expect(validateQuickLoginPassword('op12').valid).toBe(false);
  });

  it('rejeita sem letra ou sem número', () => {
    expect(validateQuickLoginPassword('123456').valid).toBe(false); // sem letra
    expect(validateQuickLoginPassword('abcdef').valid).toBe(false); // sem número
  });
});
