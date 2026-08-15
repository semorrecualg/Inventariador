// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  pullDedupKey,
  markPullCompleted,
  wasPullCompleted,
  clearPullDedup,
  shouldSkipPull,
  hasLocalBaseData
} from '../utils/syncDedup';

const STORAGE_KEY = 'gbr_sync_pull_done';

describe('syncDedup — deduplicação do pull do inventário (Etapa 1 FLUXO_ACESSO_INICIAL)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  describe('pullDedupKey', () => {
    it('monta a chave composta [tenantid|unidade] em maiúsculas', () => {
      expect(pullDedupKey('cicopal', '010101 CICOPAL GO')).toBe('CICOPAL|010101 CICOPAL GO');
    });

    it('normaliza ausentes/undefined para vazio', () => {
      expect(pullDedupKey(undefined, undefined)).toBe('|');
      expect(pullDedupKey('CICOPAL', null)).toBe('CICOPAL|');
    });
  });

  describe('mark/was/clearPullCompleted', () => {
    it('registra e reconhece o pull do mesmo tenant+unidade', () => {
      markPullCompleted('CICOPAL', '010101 CICOPAL GO');
      expect(wasPullCompleted('CICOPAL', '010101 CICOPAL GO')).toBe(true);
    });

    it('NÃO reconhece pull de outro tenant (muro multi-tenant)', () => {
      markPullCompleted('CICOPAL', '');
      expect(wasPullCompleted('CLIENTETESTE', '')).toBe(false);
    });

    it('pull do contrato cobre as filiais; pull de filial NÃO cobre o contrato nem outras filiais (Etapa 4)', () => {
      // Contrato inteiro baixado → qualquer filial dele está disponível offline.
      markPullCompleted('CICOPAL', '');
      expect(wasPullCompleted('CICOPAL', '010101 CICOPAL GO')).toBe(true);

      // Pull de UMA filial não cobre o contrato inteiro nem as demais filiais.
      clearPullDedup();
      markPullCompleted('CICOPAL', '010101 CICOPAL GO');
      expect(wasPullCompleted('CICOPAL', '')).toBe(false);
      expect(wasPullCompleted('CICOPAL', '010201 SNACKS PA')).toBe(false);
    });

    it('expira após a janela (maxAgeMs) — não bloqueia atualização real da nuvem', () => {
      markPullCompleted('CICOPAL', '');
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expect(wasPullCompleted('CICOPAL', '')).toBe(false);
    });

    it('aceita janela customizada', () => {
      markPullCompleted('CICOPAL', '');
      vi.advanceTimersByTime(60_000);
      expect(wasPullCompleted('CICOPAL', '', 30_000)).toBe(false);
      expect(wasPullCompleted('CICOPAL', '', 120_000)).toBe(true);
    });

    it('clearPullDedup remove o registro', () => {
      markPullCompleted('CICOPAL', '');
      clearPullDedup();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(wasPullCompleted('CICOPAL', '')).toBe(false);
    });

    it('ignora registro corrompido no storage', () => {
      sessionStorage.setItem(STORAGE_KEY, 'not-json{');
      expect(wasPullCompleted('CICOPAL', '')).toBe(false);
    });
  });

  describe('shouldSkipPull', () => {
    it('pula apenas quando o pull já foi feito E a base local tem dados', () => {
      expect(shouldSkipPull(true, true)).toBe(true);
      expect(shouldSkipPull(false, true)).toBe(false);
      expect(shouldSkipPull(true, false)).toBe(false);
      expect(shouldSkipPull(false, false)).toBe(false);
    });
  });

  describe('hasLocalBaseData — base local tem dados mesmo antes do boot terminar (fix Etapa 5b)', () => {
    beforeEach(() => {
      localStorage.removeItem('isDatabaseLoaded');
    });

    it('inventário em memória > 0 → true, independente da flag persistida', () => {
      localStorage.removeItem('isDatabaseLoaded');
      expect(hasLocalBaseData(12636)).toBe(true);
    });

    it('memória vazia + flag isDatabaseLoaded=true (sessão anterior) → true', () => {
      localStorage.setItem('isDatabaseLoaded', 'true');
      expect(hasLocalBaseData(0)).toBe(true);
    });

    it('memória vazia + flag ausente (primeira sessão ou higienização) → false', () => {
      expect(hasLocalBaseData(0)).toBe(false);
      localStorage.setItem('isDatabaseLoaded', 'false');
      expect(hasLocalBaseData(0)).toBe(false);
    });

    it('higienização remove a flag → false mesmo com inventário em memória zerado', () => {
      localStorage.setItem('isDatabaseLoaded', 'true');
      expect(hasLocalBaseData(0)).toBe(true);
      localStorage.removeItem('isDatabaseLoaded');
      expect(hasLocalBaseData(0)).toBe(false);
    });
  });
});
