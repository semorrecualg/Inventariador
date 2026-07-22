// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const BUFFER_MAX_SIZE = 50;

const { mockGetBufferedChangesCount, mockFlushFieldChanges } = vi.hoisted(() => ({
  mockGetBufferedChangesCount: vi.fn().mockReturnValue(0),
  mockFlushFieldChanges: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/sqliteService', () => ({
  sqliteService: {
    getBufferedChangesCount: mockGetBufferedChangesCount,
    flushFieldChanges: mockFlushFieldChanges,
  },
}));

import { useBufferController } from '../hooks/useBufferController';

describe('useBufferController - auto-flush integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetBufferedChangesCount.mockClear();
    mockFlushFieldChanges.mockClear();
    mockGetBufferedChangesCount.mockReturnValue(0);
    mockFlushFieldChanges.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT auto-flush when buffer count is below threshold', async () => {
    mockGetBufferedChangesCount.mockReturnValue(10);

    renderHook(() => useBufferController());

    await act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockFlushFieldChanges).not.toHaveBeenCalled();
  });

  it('should auto-flush when buffer count reaches BUFFER_MAX_SIZE', () => {
    mockGetBufferedChangesCount.mockReturnValue(BUFFER_MAX_SIZE);

    renderHook(() => useBufferController());

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);
  });

  it('should auto-flush when buffer count exceeds BUFFER_MAX_SIZE', () => {
    mockGetBufferedChangesCount.mockReturnValue(75);

    renderHook(() => useBufferController());

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);
  });

  it('should NOT auto-flush while already flushing (concurrency guard)', () => {
    mockGetBufferedChangesCount.mockReturnValue(BUFFER_MAX_SIZE);
    mockFlushFieldChanges.mockReturnValue(new Promise<void>(() => {}));

    renderHook(() => useBufferController());

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);
  });

  it('should auto-flush again after flush completes and buffer still full', async () => {
    mockGetBufferedChangesCount.mockReturnValue(BUFFER_MAX_SIZE);
    mockFlushFieldChanges.mockResolvedValue(undefined);

    renderHook(() => useBufferController());

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(2);
  });

  it('should stop auto-flushing when buffer count drops below threshold', async () => {
    mockGetBufferedChangesCount
      .mockReturnValueOnce(BUFFER_MAX_SIZE)
      .mockReturnValue(5);

    mockFlushFieldChanges.mockResolvedValue(undefined);

    renderHook(() => useBufferController());

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);
  });

  it('should expose pendingCount and isFlushing from the hook', async () => {
    mockGetBufferedChangesCount.mockReturnValue(42);

    const { result } = renderHook(() => useBufferController());

    expect(result.current.pendingCount).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(result.current.pendingCount).toBe(42);
    expect(typeof result.current.flush).toBe('function');
  });

  it('should not crash when flushFieldChanges throws', async () => {
    mockGetBufferedChangesCount.mockReturnValue(BUFFER_MAX_SIZE);
    mockFlushFieldChanges.mockRejectedValue(new Error('db error'));

    renderHook(() => useBufferController());

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(1);

    mockFlushFieldChanges.mockResolvedValue(undefined);

    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(mockFlushFieldChanges).toHaveBeenCalledTimes(2);
  });
});
