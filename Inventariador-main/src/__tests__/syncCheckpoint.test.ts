// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  syncCheckpointKey,
  readSyncCheckpoint,
  saveSyncCheckpoint,
  advanceSyncCheckpoint,
  clearSyncCheckpoint,
  clearAllSyncCheckpoints,
  computeMaxUpdatedAt,
  resolveDeltaMode,
  type SyncCheckpoint
} from '../utils/syncCheckpoint';

const STORAGE_KEY = 'gbr_sync_checkpoints';

describe('syncCheckpoint — checkpoint de delta sync por [tenantid+filial] (Etapa 5b FLUXO_ACESSO_INICIAL)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('syncCheckpointKey', () => {
    it('monta a chave composta [tenantid|filial] em maiúsculas', () => {
      expect(syncCheckpointKey('cicopal', '010101 CICOPAL GO')).toBe('CICOPAL|010101 CICOPAL GO');
    });

    it('normaliza ausentes/undefined para vazio (mesmo formato do dedup)', () => {
      expect(syncCheckpointKey(undefined, undefined)).toBe('|');
      expect(syncCheckpointKey('CICOPAL', null)).toBe('CICOPAL|');
    });
  });

  describe('save/read/clear', () => {
    it('salva e lê o checkpoint de uma chave', () => {
      saveSyncCheckpoint('CICOPAL|010101 CICOPAL GO', '2026-08-13T12:00:00.000Z');
      const rec = readSyncCheckpoint('CICOPAL|010101 CICOPAL GO');
      expect(rec).not.toBeNull();
      expect(rec!.lastUpdatedAt).toBe('2026-08-13T12:00:00.000Z');
      expect(rec!.key).toBe('CICOPAL|010101 CICOPAL GO');
    });

    it('checkpoints são ISOLADOS por chave (muro multi-tenant)', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T12:00:00.000Z');
      expect(readSyncCheckpoint('CLIENTETESTE|')).toBeNull();
      expect(readSyncCheckpoint('CICOPAL|010101 CICOPAL GO')).toBeNull();
    });

    it('clearSyncCheckpoint remove apenas a chave alvo', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T12:00:00.000Z');
      saveSyncCheckpoint('CICOPAL|010101 CICOPAL GO', '2026-08-13T12:00:00.000Z');
      clearSyncCheckpoint('CICOPAL|');
      expect(readSyncCheckpoint('CICOPAL|')).toBeNull();
      expect(readSyncCheckpoint('CICOPAL|010101 CICOPAL GO')).not.toBeNull();
    });

    it('clearAllSyncCheckpoints zera tudo (higienização física)', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T12:00:00.000Z');
      clearAllSyncCheckpoints();
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{}');
      expect(readSyncCheckpoint('CICOPAL|')).toBeNull();
    });

    it('lê null para registro ausente ou corrompido', () => {
      expect(readSyncCheckpoint('CICOPAL|')).toBeNull();
      localStorage.setItem(STORAGE_KEY, 'not-json{');
      expect(readSyncCheckpoint('CICOPAL|')).toBeNull();
    });
  });

  describe('advanceSyncCheckpoint — monotônico', () => {
    it('avança quando o novo updated_at é maior', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T12:00:00.000Z');
      advanceSyncCheckpoint('CICOPAL|', '2026-08-13T13:00:00.000Z');
      expect(readSyncCheckpoint('CICOPAL|')!.lastUpdatedAt).toBe('2026-08-13T13:00:00.000Z');
    });

    it('NÃO retrocede com timestamp menor/igual (delta não desce o checkpoint)', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T13:00:00.000Z');
      advanceSyncCheckpoint('CICOPAL|', '2026-08-13T11:00:00.000Z');
      advanceSyncCheckpoint('CICOPAL|', '2026-08-13T13:00:00.000Z');
      expect(readSyncCheckpoint('CICOPAL|')!.lastUpdatedAt).toBe('2026-08-13T13:00:00.000Z');
    });

    it('ignora undefined (sem updated_at nos ativos)', () => {
      saveSyncCheckpoint('CICOPAL|', '2026-08-13T12:00:00.000Z');
      advanceSyncCheckpoint('CICOPAL|', undefined);
      expect(readSyncCheckpoint('CICOPAL|')!.lastUpdatedAt).toBe('2026-08-13T12:00:00.000Z');
    });
  });

  describe('computeMaxUpdatedAt', () => {
    it('retorna o maior updated_at ISO entre os ativos', () => {
      const max = computeMaxUpdatedAt([
        { updated_at: '2026-08-13T10:00:00.000Z' },
        { updated_at: '2026-08-13T14:30:00.000Z' },
        { updated_at: '2026-08-13T09:00:00.000Z' }
      ]);
      expect(max).toBe('2026-08-13T14:30:00.000Z');
    });

    it('retorna undefined quando nenhum ativo tem updated_at válido', () => {
      expect(computeMaxUpdatedAt([])).toBeUndefined();
      expect(computeMaxUpdatedAt([{ updated_at: '' }, { updated_at: 'invalido' }])).toBeUndefined();
    });
  });

  describe('resolveDeltaMode', () => {
    const checkpoint: SyncCheckpoint = {
      key: 'CICOPAL|010101 CICOPAL GO',
      lastUpdatedAt: '2026-08-13T12:00:00.000Z',
      savedAt: '2026-08-13T12:00:00.000Z'
    };

    it('checkpoint válido + sem força → delta incremental com since', () => {
      const mode = resolveDeltaMode(checkpoint, false);
      expect(mode.incremental).toBe(true);
      expect(mode.since).toBe('2026-08-13T12:00:00.000Z');
    });

    it('forceFull → pull completo (sem since), mesmo com checkpoint', () => {
      const mode = resolveDeltaMode(checkpoint, true);
      expect(mode.incremental).toBe(false);
      expect(mode.since).toBeUndefined();
    });

    it('sem checkpoint → pull completo', () => {
      expect(resolveDeltaMode(null, false)).toEqual({ since: undefined, incremental: false });
    });

    it('checkpoint sem lastUpdatedAt → pull completo', () => {
      const empty: SyncCheckpoint = { key: 'CICOPAL|', lastUpdatedAt: '', savedAt: '' };
      expect(resolveDeltaMode(empty, false)).toEqual({ since: undefined, incremental: false });
    });
  });
});
