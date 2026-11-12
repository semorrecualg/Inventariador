// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase, saveUnitConfig, saveUnitConfigFlags, getDatabaseMode } from '../services/supabaseService';

/**
 * Modo INTERNAL = zero chamadas à nuvem (docs/ARCHITECTURE.md §10).
 * Aqui a prova é dupla: o cliente Supabase não é usado (`from`) e nenhum
 * pedido de rede sai pelo `fetch`. O dado continua a ficar no aparelho.
 */
describe('Modo INTERNAL — saveUnitConfig/saveUnitConfigFlags não tocam a nuvem', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let fromSpy: any;
  let fetchSpy: any;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'INTERNAL');
    fromSpy = vi.spyOn(supabase as any, 'from');
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const anchor = {
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    unit_id: '010101 CICOPAL GO',
    lat: -16.706719,
    lng: -49.106422,
    radius_meters: 500,
    is_active: true,
    updated_by: 'auditor'
  };

  it('confirma o modo INTERNAL e mantém a âncora só no aparelho', async () => {
    expect(getDatabaseMode()).toBe('INTERNAL');

    const result = await saveUnitConfig(anchor as never);

    expect(result).toBe(true);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    // A âncora não se perde: fica no cache local do aparelho.
    expect(localStorage.getItem('local_unit_configs') || '').toContain('010101 CICOPAL GO');
  });

  it('não envia flags de política para unit_configs em modo INTERNAL', async () => {
    const result = await saveUnitConfigFlags({ ...anchor, requireNf: true } as never);

    expect(result).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
