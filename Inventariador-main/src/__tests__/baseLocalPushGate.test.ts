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
  fetchCloudConflictRows: vi.fn(async () => new Map<string, Record<string, unknown>>()),
  chaveDaNuvem: (t: unknown, p: unknown) => `${String(t || '').trim().toUpperCase()}|${String(p || '').trim()}`,
  isQuotaExceededError: () => false,
  // Portão de sessão da nuvem: aqui o alvo é o modo de base, não a sessão.
  garantirSessaoNuvemParaEnvio: vi.fn(async () => {}),
  SessaoNuvemAusenteError: class SessaoNuvemAusenteError extends Error {}
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
import { SYSTEM_LOCK_KEY } from '../utils/systemLock';

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

// H1 · Fase 3 — a blindagem física tem de fechar a subida mesmo com o modo de
// nuvem já em memória. Antes só valia no arranque (forçava INTERNAL): um app
// aberto e blindado pelo Administrador continuava a enviar no ciclo de 60 s.
describe('canPushToCloud — a blindagem física fecha a subida', () => {
  beforeEach(() => {
    fromMock.mockClear();
    localStorage.removeItem(SYSTEM_LOCK_KEY);
    modo.value = 'SUPABASE';
  });

  it('com o sistema blindado o portão fecha e os ciclos não tocam na nuvem', async () => {
    localStorage.setItem(SYSTEM_LOCK_KEY, 'true');

    expect(canPushToCloud()).toBe(false);
    await expect(syncService.processDataSyncQueue())
      .resolves.toEqual({ success: true, processedCount: 0 });
    await expect(photoSyncManager.processPhotoSyncQueue())
      .resolves.toEqual({ success: true, uploadCount: 0, failedCount: 0 });
    await expect(processCampaignSyncQueue())
      .resolves.toEqual({ success: true, processedCount: 0 });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it('ao libertar a blindagem o portão reabre sem reiniciar o app', () => {
    localStorage.setItem(SYSTEM_LOCK_KEY, 'true');
    expect(canPushToCloud()).toBe(false);

    localStorage.removeItem(SYSTEM_LOCK_KEY);
    expect(canPushToCloud()).toBe(true);
  });
});
