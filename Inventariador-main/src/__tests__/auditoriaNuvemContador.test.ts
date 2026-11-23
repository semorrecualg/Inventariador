// @vitest-environment jsdom
// ============================================================================
// auditoriaNuvemContador.test.ts — contador remoto da trilha por contrato (F2).
//
// O contador «N por subir» diz o que falta, mas não prova que a fila subiu.
// `contarAuditoriaNuvem` lê o total da trilha DO CONTRATO na nuvem (só leitura,
// `head: true` + `count: exact`) e tem de:
//   - não tocar na nuvem em BASE LOCAL nem offline (`estado: 'off'`);
//   - recusar uma contagem sem contrato (isolamento multi-tenant);
//   - devolver o erro carimbado quando a nuvem recusa (ex.: migração pendente).
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { modo, eqMock, selectMock, fromMock } = vi.hoisted(() => {
  const eqMock = vi.fn();
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return { modo: { value: 'INTERNAL' }, eqMock, selectMock, fromMock };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

vi.mock('../services/supabaseService', () => ({
  supabase: { from: fromMock },
  getDatabaseMode: () => modo.value,
  // Mesma regra do serviço real: INTERNAL e INTERNAL_PLUS são base local.
  isOnlineDatabaseMode: (m?: string | null) => !String(m ?? modo.value).startsWith('INTERNAL')
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { contarAuditoriaNuvem } from '../services/auditoriaNuvem';

beforeEach(() => {
  fromMock.mockClear();
  selectMock.mockClear();
  eqMock.mockReset();
  eqMock.mockResolvedValue({ count: 0, error: null });
  modo.value = 'INTERNAL';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contador remoto da trilha — BASE LOCAL', () => {
  it('não consulta a nuvem e devolve o estado off', async () => {
    localStorage.setItem('tenantid', 'CICOPAL');

    await expect(contarAuditoriaNuvem()).resolves.toMatchObject({
      estado: 'off',
      tenantid: 'CICOPAL',
      total: null
    });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('contador remoto da trilha — Base Oficial', () => {
  beforeEach(() => {
    modo.value = 'SUPABASE';
  });

  it('conta só o contrato pedido, por count exact e sem transferir linhas', async () => {
    eqMock.mockResolvedValue({ count: 42, error: null });

    await expect(contarAuditoriaNuvem(' cicopal ')).resolves.toEqual({
      estado: 'ok',
      tenantid: 'CICOPAL',
      total: 42
    });

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqMock).toHaveBeenCalledWith('tenantid', 'CICOPAL');
  });

  it('usa o contrato da sessão quando não recebe argumento', async () => {
    localStorage.setItem('tenantid', 'clienteTeste');
    eqMock.mockResolvedValue({ count: 7, error: null });

    await expect(contarAuditoriaNuvem()).resolves.toMatchObject({
      estado: 'ok',
      tenantid: 'CLIENTETESTE',
      total: 7
    });
  });

  it('sem contrato resolvido não faz contagem global', async () => {
    const resultado = await contarAuditoriaNuvem();

    expect(resultado).toMatchObject({ estado: 'erro', tenantid: null, total: null });
    expect(resultado.message).toMatch(/Sem contrato/);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('devolve o erro da nuvem carimbado, sem inventar total', async () => {
    eqMock.mockResolvedValue({
      count: null,
      error: { message: 'column audit_logs.client_event_id does not exist' }
    });

    await expect(contarAuditoriaNuvem('CICOPAL')).resolves.toMatchObject({
      estado: 'erro',
      tenantid: 'CICOPAL',
      total: null,
      message: 'column audit_logs.client_event_id does not exist'
    });
  });

  it('offline não consulta a nuvem', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      await expect(contarAuditoriaNuvem('CICOPAL')).resolves.toMatchObject({
        estado: 'off',
        total: null
      });
      expect(fromMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });
});
