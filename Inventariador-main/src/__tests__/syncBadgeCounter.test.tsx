// @vitest-environment jsdom
// ============================================================================
// syncBadgeCounter.test.tsx — «Sincronizado» com trabalho por enviar.
//
// O selo contava `db.ativos`. A confirmação pelo cartão grava `_is_synced: 0` em
// `local_assets` (a tabela que a fila lê) e em `ativos` só mexe no `_conferido`
// — o `_is_synced` de `ativos` ficava a 1. Resultado: o selo dizia
// «Sincronizado» e o botão manual ficava desactivado com a fila cheia.
// ============================================================================
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/syncService', () => ({
  syncService: { processDataSyncQueue: vi.fn().mockResolvedValue({ success: true, processedCount: 0 }) },
  photoSyncManager: { processPhotoSyncQueue: vi.fn().mockResolvedValue({ success: true, uploadCount: 0 }) },
}));

import { db } from '../services/sqliteService';
import SyncBadge from '../components/SyncBadge';

const linha = (over: Record<string, unknown> = {}) => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  etiqueta: '004229',
  _is_synced: 0,
  _is_deleted: 0,
  ...over,
});

describe('SyncBadge — contador de pendentes', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('conta o pendente de local_assets mesmo com ativos já marcado como sincronizado', async () => {
    await db.ativos.put(linha({ _is_synced: 1 }) as never);
    await db.local_assets.put(linha({ _is_synced: 0 }) as never);

    render(<SyncBadge />);

    await waitFor(() => expect(screen.getByText('1 pendentes')).toBeTruthy());
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('diz «Sincronizado» quando nada está pendente', async () => {
    await db.local_assets.put(linha({ _is_synced: 1 }) as never);

    render(<SyncBadge />);

    await waitFor(() => expect(screen.getByText('Sincronizado')).toBeTruthy());
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('não conta registos apagados', async () => {
    await db.local_assets.put(linha({ _is_synced: 0, _is_deleted: 1 }) as never);

    render(<SyncBadge />);

    await waitFor(() => expect(screen.getByText('Sincronizado')).toBeTruthy());
  });
});
