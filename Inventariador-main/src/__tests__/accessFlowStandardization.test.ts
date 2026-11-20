// @vitest-environment jsdom
// src/__tests__/accessFlowStandardization.test.ts
// Fase 1 do acesso padronizado (biometria → contrato → SaaS):
// 1) a última escolha deixa de saltar o contrato (passa a pré-seleção);
// 2) INVENTARIADOR exige filial escolhida;
// 3) o hub (MAIN_MENU) devolve ao contrato quando não há contexto ativo.
import { describe, it, expect, vi } from 'vitest';
import { shouldReturnHubToWorkContext } from '../utils/routingUtils';
import {
  canConfirmWorkContext,
  canConfirmWorkContextSemFiliais,
  resolveWorkContextPreselection,
  type LastWorkContext,
  type WorkContext
} from '../utils/workContextUtils';
import { AppModule, AppScreen, UserRole } from '../types';

vi.mock('../services/sqliteService', () => ({
  sqliteService: {
    countAtivos: vi.fn(),
    countAtivosByTenant: vi.fn()
  }
}));

const CICOPAL_GO: WorkContext = { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' };

const auditor = {
  role: UserRole.AUDITOR,
  tenantid: 'CICOPAL',
  units: ['010101 CICOPAL GO']
};

function lastContext(over: Partial<LastWorkContext> = {}): LastWorkContext {
  return {
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    module: AppModule.INVENTORY,
    savedAt: '2026-11-17T10:00:00.000Z',
    ...over
  };
}

describe('resolveWorkContextPreselection — última escolha só como pré-seleção', () => {
  it('devolve contrato, filial e módulo para o seletor abrir já apontado', () => {
    expect(resolveWorkContextPreselection(lastContext(), [CICOPAL_GO], auditor)).toEqual({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      module: AppModule.INVENTORY
    });
  });

  it('não devolve nada sem escolha guardada', () => {
    expect(resolveWorkContextPreselection(null, [CICOPAL_GO], auditor)).toBeNull();
  });

  it('não devolve nada quando a filial guardada já não está autorizada', () => {
    const revogada = lastContext({ filial: '010201 SNACKS PA' });
    expect(resolveWorkContextPreselection(revogada, [CICOPAL_GO], auditor)).toBeNull();
  });

  it('não devolve CONTROLE DE ATIVO para auditor de campo', () => {
    const controle = lastContext({ module: AppModule.ASSET_CONTROL });
    expect(resolveWorkContextPreselection(controle, [CICOPAL_GO], auditor)).toBeNull();
  });

  it('devolve apenas dados — a função não navega nem confirma o contrato', () => {
    // Assinatura de 3 argumentos: não recebe pushScreen nem callback de navegação.
    expect(resolveWorkContextPreselection.length).toBe(3);
  });
});

describe('canConfirmWorkContextSemFiliais — o contrato sem filial não fecha a porta', () => {
  it('admin com a lista vazia segue para a Unidade Operacional', () => {
    expect(
      canConfirmWorkContextSemFiliais(AppModule.INVENTORY, {
        temFiliaisNaLista: false,
        podeAdministrar: true
      })
    ).toBe(true);
  });

  it('auditor com a lista vazia continua bloqueado (vaivém /unit ↔ /contexto)', () => {
    expect(
      canConfirmWorkContextSemFiliais(AppModule.INVENTORY, {
        temFiliaisNaLista: false,
        podeAdministrar: false
      })
    ).toBe(false);
  });

  it('com filiais na lista, vale a regra normal (escolher uma)', () => {
    expect(
      canConfirmWorkContextSemFiliais(AppModule.INVENTORY, {
        temFiliaisNaLista: true,
        podeAdministrar: true
      })
    ).toBe(false);
  });

  it('só se aplica ao INVENTARIADOR', () => {
    expect(
      canConfirmWorkContextSemFiliais(AppModule.ASSET_CONTROL, {
        temFiliaisNaLista: false,
        podeAdministrar: true
      })
    ).toBe(false);
  });
});

describe('canConfirmWorkContext — INVENTARIADOR exige filial', () => {
  it('INVENTARIADOR sem filial não confirma', () => {
    expect(canConfirmWorkContext(AppModule.INVENTORY, '')).toBe(false);
    expect(canConfirmWorkContext(AppModule.INVENTORY, '   ')).toBe(false);
    expect(canConfirmWorkContext(AppModule.INVENTORY, null)).toBe(false);
  });

  it('INVENTARIADOR com filial confirma', () => {
    expect(canConfirmWorkContext(AppModule.INVENTORY, '010101 CICOPAL GO')).toBe(true);
  });

  it('CONTROLE DE ATIVO confirma sem filial (não usa endereço de campo)', () => {
    expect(canConfirmWorkContext(AppModule.ASSET_CONTROL, '')).toBe(true);
  });

  it('sem módulo escolhido nunca confirma', () => {
    expect(canConfirmWorkContext(null, '010101 CICOPAL GO')).toBe(false);
  });
});

describe('shouldReturnHubToWorkContext — hub sem contexto ativo volta ao contrato', () => {
  it('MAIN_MENU sem unidade ativa devolve ao contrato', () => {
    expect(shouldReturnHubToWorkContext(AppScreen.MAIN_MENU, null)).toBe(true);
    expect(shouldReturnHubToWorkContext(AppScreen.MAIN_MENU, '')).toBe(true);
    expect(shouldReturnHubToWorkContext(AppScreen.MAIN_MENU, '   ')).toBe(true);
  });

  it('MAIN_MENU com unidade ativa fica no hub', () => {
    expect(shouldReturnHubToWorkContext(AppScreen.MAIN_MENU, '010101 CICOPAL GO')).toBe(false);
  });

  it('painel de governança aberto pelo contrato não é rebatido', () => {
    expect(shouldReturnHubToWorkContext(AppScreen.MAIN_MENU, null, true)).toBe(false);
  });

  it('só o hub é afetado', () => {
    expect(shouldReturnHubToWorkContext(AppScreen.DASHBOARD, null)).toBe(false);
    expect(shouldReturnHubToWorkContext(AppScreen.UNIT_SELECTION, null)).toBe(false);
    expect(shouldReturnHubToWorkContext(AppScreen.WORK_CONTEXT_SELECTION, null)).toBe(false);
  });
});
