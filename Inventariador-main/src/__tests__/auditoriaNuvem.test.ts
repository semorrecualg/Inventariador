// @vitest-environment jsdom
// ============================================================================
// auditoriaNuvem.test.ts — a trilha de auditoria tem destino durável (F2).
//
// Em Base Oficial, `logAuditEvent` fazia um `insert` direto com timeout de 2 s:
// uma falha de rede perdia o evento. Agora a linha nasce no Dexie e sobe em
// lotes por `upsert` com `client_event_id` (= `id` local), por isso o reenvio
// não duplica; uma recusa fica carimbada e a linha continua na fila.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { modo, upsertMock, fromMock } = vi.hoisted(() => {
  const upsertMock = vi.fn();
  const fromMock = vi.fn(() => ({ upsert: upsertMock }));
  return { modo: { value: 'INTERNAL' }, upsertMock, fromMock };
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

import { db } from '../services/sqliteService';
import {
  enviarFilaAuditoria,
  contarAuditoriaPendente,
  mapearLogParaNuvem
} from '../services/auditoriaNuvem';

const EVENTO = {
  usuario: 'auditor@gbr.com.br',
  acao: 'CONFERENCIA',
  tabela: 'local_assets',
  registro_id: 'PK-1',
  details: 'ativo conferido',
  delta: JSON.stringify({ status: 'CONFERIDO' }),
  updated_at: '2026-11-23T10:00:00.000Z',
  _synced: 0
};

const semear = async (id: string, extra: Record<string, unknown> = {}) => {
  await db.audit_logs.put({ id, ...EVENTO, ...extra });
};

beforeEach(async () => {
  await db.audit_logs.clear();
  fromMock.mockClear();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ error: null });
  modo.value = 'INTERNAL';
  localStorage.clear();
  sessionStorage.clear();
});

describe('fila da trilha — BASE LOCAL é hermética', () => {
  it('em BASE LOCAL não chama a nuvem e o evento fica por subir', async () => {
    await semear('LOG_INTERNAL');

    await expect(enviarFilaAuditoria()).resolves.toMatchObject({ success: true, enviados: 0 });

    expect(fromMock).not.toHaveBeenCalled();
    expect(await contarAuditoriaPendente()).toBe(1);
    expect((await db.audit_logs.get('LOG_INTERNAL'))?._synced).toBe(0);
  });
});

describe('fila da trilha — Base Oficial', () => {
  beforeEach(() => {
    modo.value = 'SUPABASE';
    localStorage.setItem('tenantid', 'CICOPAL');
  });

  it('envia por client_event_id e marca a linha como confirmada', async () => {
    await semear('LOG_1');

    const resultado = await enviarFilaAuditoria();

    expect(resultado).toMatchObject({ success: true, enviados: 1, falhados: 0, pendentes: 0 });
    expect(fromMock).toHaveBeenCalledWith('audit_logs');

    const [payload, opcoes] = upsertMock.mock.calls[0] as [
      Record<string, unknown>[],
      { onConflict: string; ignoreDuplicates?: boolean },
    ];
    // Append-only na nuvem (só SELECT/INSERT em audit_logs): ON CONFLICT DO
    // NOTHING, para o reenvio não exigir UPDATE nem reescrever a linha.
    expect(opcoes).toEqual({ onConflict: 'client_event_id', ignoreDuplicates: true });
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      client_event_id: 'LOG_1',
      user_email: 'auditor@gbr.com.br',
      action: 'CONFERENCIA',
      table_name: 'local_assets',
      record_id: 'PK-1',
      origin: 'APP',
      created_at: '2026-11-23T10:00:00.000Z',
      tenantid: 'CICOPAL',
      new_data: { status: 'CONFERIDO' }
    });

    expect((await db.audit_logs.get('LOG_1'))?._synced).toBe(1);
    expect(await contarAuditoriaPendente()).toBe(0);
  });

  it('sobe com o contrato do nascimento, mesmo com outro contrato activo no envio', async () => {
    await semear('LOG_NASCIDO', { tenantid: 'CICOPAL' });
    // O operador trocou de contrato antes de a fila subir.
    localStorage.setItem('tenantid', 'OUTRO_CONTRATO');

    await enviarFilaAuditoria();

    const [payload] = upsertMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload.tenantid).toBe('CICOPAL');
  });

  it('envia old_data e new_data em colunas próprias', async () => {
    await semear('LOG_ESTADOS', {
      tenantid: 'CICOPAL',
      old_data: JSON.stringify({ status: 'PENDENTE' }),
      new_data: JSON.stringify({ status: 'CONFERIDO' })
    });

    await enviarFilaAuditoria();

    const [payload] = upsertMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload.new_data).toEqual({ status: 'CONFERIDO' });
    expect(payload.old_data).toEqual({ status: 'PENDENTE' });
  });

  it('reenviar não duplica: sem pendentes, não há segundo upsert', async () => {
    await semear('LOG_2');

    await enviarFilaAuditoria();
    await expect(enviarFilaAuditoria()).resolves.toMatchObject({ enviados: 0, pendentes: 0 });

    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('recusa da nuvem mantém a linha na fila com o motivo carimbado', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'column client_event_id does not exist' } });
    await semear('LOG_3');

    const resultado = await enviarFilaAuditoria();

    expect(resultado.success).toBe(false);
    expect(resultado.falhados).toBe(1);

    const linha = await db.audit_logs.get('LOG_3');
    expect(linha?._synced).toBe(0);
    expect(linha?._syncAttempts).toBe(1);
    expect(linha?._syncError).toContain('client_event_id');
    expect(await contarAuditoriaPendente()).toBe(1);
  });
});

describe('mapeamento local → nuvem', () => {
  it('não rebenta com delta em texto livre e não inventa new_data', () => {
    const mapa = mapearLogParaNuvem(
      {
        id: 'LOG_X',
        usuario: 'auditor@gbr.com.br',
        acao: 'LOGIN',
        tabela: 'users',
        registro_id: 'U-1',
        details: 'login ok',
        delta: 'texto solto',
        updated_at: '2026-11-23T10:00:00.000Z'
      },
      null
    );

    expect(mapa).not.toHaveProperty('new_data');
    expect(mapa.client_event_id).toBe('LOG_X');
    // Linha legada (sem carimbo): usa o contrato activo como fallback.
    expect(mapa.tenantid).toBeNull();
  });

  it('linha legada com `delta` continua a alimentar `new_data`', () => {
    const mapa = mapearLogParaNuvem(
      {
        id: 'LOG_LEGADO',
        usuario: 'auditor@gbr.com.br',
        acao: 'CONFERENCIA',
        tabela: 'local_assets',
        registro_id: 'PK-1',
        details: 'conferido',
        delta: JSON.stringify({ status: 'CONFERIDO' }),
        updated_at: '2026-11-23T10:00:00.000Z'
      },
      'CICOPAL'
    );

    expect(mapa.new_data).toEqual({ status: 'CONFERIDO' });
    expect(mapa).not.toHaveProperty('old_data');
    expect(mapa.tenantid).toBe('CICOPAL');
  });
});
