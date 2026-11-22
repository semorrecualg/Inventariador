// @vitest-environment jsdom
// ============================================================================
// baseLocalPushGate.test.ts — BASE LOCAL não envia nada para a nuvem.
//
// O ciclo de fundo (`runSyncLoopCycle` → `processDataSyncQueue`,
// `photoSyncManager`, `processCampaignSyncQueue`) exigia apenas
// `Capacitor.isNativePlatform()`. Com sessão e filial activas, ativos conferidos
// em modo BASE LOCAL podiam subir para o Supabase. Decisão F1: BASE LOCAL é
// hermética — `canPushToCloud` passa a exigir também
// `isOnlineDatabaseMode(getDatabaseMode())`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { modo, fromMock } = vi.hoisted(() => ({
  modo: { value: 'INTERNAL' },
  fromMock: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

vi.mock('../services/supabaseService', () => ({
  supabase: { from: fromMock, storage: { from: vi.fn() } },
  registerCampaignSyncQueueDelegate: vi.fn(),
  getDatabaseMode: () => modo.value,
  // Mesma regra do serviço real: INTERNAL e INTERNAL_PLUS são base local.
  isOnlineDatabaseMode: (m?: string | null) => !String(m ?? modo.value).startsWith('INTERNAL'),
  fetchCloudDeletedKeys: vi.fn(async () => new Set<string>()),
  isQuotaExceededError: () => false
}));

vi.mock('../services/sqliteService', () => ({
  db: {},
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => true,
    logAuditEvent: vi.fn(),
    markAssetsSynced: vi.fn(),
    persist: vi.fn()
  }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  canPushToCloud,
  syncService,
  photoSyncManager,
  processCampaignSyncQueue
} from '../services/syncService';

describe('canPushToCloud — a BASE LOCAL é hermética', () => {
  beforeEach(() => {
    fromMock.mockClear();
  });

  it('em BASE LOCAL os três ciclos processam 0 registos sem tocar na nuvem', async () => {
    modo.value = 'INTERNAL';
    expect(canPushToCloud()).toBe(false);

    await expect(syncService.processDataSyncQueue())
      .resolves.toEqual({ success: true, processedCount: 0 });
    await expect(photoSyncManager.processPhotoSyncQueue())
      .resolves.toEqual({ success: true, uploadCount: 0, failedCount: 0 });
    await expect(processCampaignSyncQueue())
      .resolves.toEqual({ success: true, processedCount: 0 });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('INTERNAL_PLUS também é base local', async () => {
    modo.value = 'INTERNAL_PLUS';
    expect(canPushToCloud()).toBe(false);
    await expect(syncService.processDataSyncQueue())
      .resolves.toEqual({ success: true, processedCount: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('na BASE OFICIAL o portão continua aberto', () => {
    modo.value = 'SUPABASE';
    expect(canPushToCloud()).toBe(true);
  });
});
