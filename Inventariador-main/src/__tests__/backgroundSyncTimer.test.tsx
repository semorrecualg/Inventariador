// @vitest-environment jsdom
// ============================================================================
// backgroundSyncTimer.test.tsx — o ciclo de fundo corre com a WebView reiniciada.
//
// Antes do #111 o temporizador exigia `sessionStorage.getItem('filial')`. O
// Android esvazia essa chave quando mata a WebView em segundo plano; o ecrã
// continua a mostrar a unidade (lê o `localStorage`), mas a fila nunca era
// chamada e os ativos tocados ficavam «Pendente Nuvem · base por espelhar»
// durante horas (004229/004231 em 2026-11-18).
//
// Este teste substitui o antigo teste que lia o texto do App.tsx: aqui o
// comportamento é exercido de verdade — com temporizadores falsos, sem
// depender de nomes de funções ou da forma do ficheiro.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { processDataSyncQueue, processPhotoSyncQueue } = vi.hoisted(() => ({
  processDataSyncQueue: vi.fn(),
  processPhotoSyncQueue: vi.fn(),
}));

vi.mock('../services/syncService', () => ({
  syncService: { processDataSyncQueue },
  photoSyncManager: { processPhotoSyncQueue },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })) },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { useBackgroundSyncTimer, BACKGROUND_SYNC_INTERVAL_MS } from '../hooks/useBackgroundSyncTimer';

describe('useBackgroundSyncTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    processDataSyncQueue.mockReset().mockResolvedValue({ success: true, processedCount: 0 });
    processPhotoSyncQueue.mockReset().mockResolvedValue({ success: true, uploadCount: 0 });
    // O reinício da WebView no Android esvazia a filial da sessão.
    sessionStorage.clear();
    expect(sessionStorage.getItem('filial')).toBeNull();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama a fila ao fim de 60 s mesmo com o sessionStorage vazio', async () => {
    const { unmount } = renderHook(() => useBackgroundSyncTimer({ tenantid: 'CICOPAL' }));

    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);

    expect(processDataSyncQueue).toHaveBeenCalledTimes(1);
    expect(processPhotoSyncQueue).toHaveBeenCalledTimes(1);

    // E continua no ciclo seguinte.
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);
    expect(processDataSyncQueue).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);
    expect(processDataSyncQueue).toHaveBeenCalledTimes(2); // desmontado, sem timer
  });

  it('não chama nada sem sessão ou sem contrato', async () => {
    const semSessao = renderHook(() => useBackgroundSyncTimer(null));
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);
    expect(processDataSyncQueue).not.toHaveBeenCalled();
    semSessao.unmount();

    const semContrato = renderHook(() => useBackgroundSyncTimer({ tenantid: '' }));
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);
    expect(processDataSyncQueue).not.toHaveBeenCalled();
    semContrato.unmount();
  });

  it('não sobrepõe ciclos quando o anterior ainda não respondeu', async () => {
    processDataSyncQueue.mockReturnValue(new Promise(() => { /* pedido pendurado */ }));

    const { unmount } = renderHook(() => useBackgroundSyncTimer({ tenantid: 'CICOPAL' }));

    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(BACKGROUND_SYNC_INTERVAL_MS);

    expect(processDataSyncQueue).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('dispara também quando a rede volta, sem esperar o minuto', async () => {
    const { unmount } = renderHook(() => useBackgroundSyncTimer({ tenantid: 'CICOPAL' }));

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(processDataSyncQueue).toHaveBeenCalledTimes(1);
    unmount();
  });
});
