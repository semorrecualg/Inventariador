// ============================================================================
// bootRedirects.test.ts — a base vazia não pode sequestrar o percurso de
// entrada. Foi assim que o mesmo arranque acabava em `/unit` num ambiente sem
// dono/base e em `/contexto` no browser (dono com bypass e dados). Estes casos
// fixam a decisão.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { AppScreen } from '../types';
import { EMPTY_BASE_EXEMPT_SCREENS, shouldForceUnitOnEmptyBase } from '../utils/bootRedirects';

describe('shouldForceUnitOnEmptyBase', () => {
  it('não redirecciona o percurso de entrada (login, biometria, contrato)', () => {
    for (const screen of [
      AppScreen.LOGIN,
      AppScreen.REGISTER,
      AppScreen.BIOMETRIC_REGISTRATION,
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.MODULE_SELECTION,
      AppScreen.MAIN_MENU
    ]) {
      expect(shouldForceUnitOnEmptyBase(screen, { vazio: true, dono: false })).toBe(false);
    }
  });

  it('redirecciona ecrãs que exigem base carregada', () => {
    for (const screen of [AppScreen.INVENTORY, AppScreen.ADDRESS_SELECTION, AppScreen.LABELING]) {
      expect(shouldForceUnitOnEmptyBase(screen, { vazio: true, dono: false })).toBe(true);
    }
  });

  it('o dono global nunca é empurrado para a unidade', () => {
    expect(shouldForceUnitOnEmptyBase(AppScreen.INVENTORY, { vazio: true, dono: true })).toBe(false);
  });

  it('com base preenchida não há redireccionamento', () => {
    expect(shouldForceUnitOnEmptyBase(AppScreen.INVENTORY, { vazio: false, dono: false })).toBe(false);
  });

  it('a regra é a mesma para todos os ecrãs isentos', () => {
    for (const screen of EMPTY_BASE_EXEMPT_SCREENS) {
      expect(shouldForceUnitOnEmptyBase(screen, { vazio: true, dono: false })).toBe(false);
    }
  });
});
