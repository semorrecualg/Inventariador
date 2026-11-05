// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppScreen } from '../types';
import { registerToastCallback, validateAndPushRoute } from '../services/NavigationGuardService';

// Bug real: ao voltar da tela Unidade Operacional (Base Local) o app empurrava
// uma tela restrita sem filial e a guarda abria o modal "CONTROLE DE FLUXO SRE"
// com "VIOLAÇÃO DE FLUXO: SELECIONE UMA FILIAL ATIVA". O bloqueio deve existir,
// mas como recuo silencioso — retorno não é violação do operador.
describe('validateAndPushRoute (guarda silenciosa)', () => {
  const toastSpy = vi.fn();

  beforeEach(() => {
    toastSpy.mockClear();
    registerToastCallback(toastSpy);
  });

  it('bloqueia telas restritas sem filial e recua para UNIT_SELECTION', () => {
    [AppScreen.DASHBOARD, AppScreen.ADDRESS_SELECTION, AppScreen.INVENTORY].forEach((screen) => {
      expect(validateAndPushRoute(screen, null)).toBe(AppScreen.UNIT_SELECTION);
    });
  });

  it('não dispara o modal/toast de violação ao recuar', () => {
    validateAndPushRoute(AppScreen.INVENTORY, null);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('mantém a navegação válida quando existe filial ativa', () => {
    [AppScreen.DASHBOARD, AppScreen.ADDRESS_SELECTION, AppScreen.INVENTORY].forEach((screen) => {
      expect(validateAndPushRoute(screen, '010101 CICOPAL GO')).toBe(screen);
    });
  });
});
