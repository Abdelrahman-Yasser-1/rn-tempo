import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useCountdown } from './useCountdown';

/** Advances one second at a time, letting React commit between ticks as it does on device. */
async function tick(seconds: number) {
  for (let index = 0; index < seconds; index += 1) {
    await actAsync(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

describe('useCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts idle at the full duration', async () => {
    const { result } = await renderHook(() => useCountdown(3));
    expect(result.current.remaining).toBe(3);
    expect(result.current.isRunning).toBe(false);
  });

  it('ticks down once per second after start and stops at zero', async () => {
    const { result } = await renderHook(() => useCountdown(3));
    await actAsync(() => {
      result.current.start();
    });
    expect(result.current.isRunning).toBe(true);
    await actAsync(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(2);
    await tick(2);
    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });

  it('reset stops the countdown and restores the duration', async () => {
    const { result } = await renderHook(() => useCountdown(3));
    await actAsync(() => {
      result.current.start();
      jest.advanceTimersByTime(1000);
    });
    await actAsync(() => {
      result.current.reset();
    });
    expect(result.current.remaining).toBe(3);
    expect(result.current.isRunning).toBe(false);
    await actAsync(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.remaining).toBe(3);
  });

  it('restarts from the full duration when started again after finishing', async () => {
    const { result } = await renderHook(() => useCountdown(2));
    await actAsync(() => {
      result.current.start();
    });
    await tick(2);
    expect(result.current.remaining).toBe(0);
    await actAsync(() => {
      result.current.start();
    });
    expect(result.current.remaining).toBe(2);
  });

  it('stops at zero when several ticks fire before React commits', async () => {
    const { result } = await renderHook(() => useCountdown(3));
    await actAsync(() => {
      result.current.start();
    });
    await actAsync(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toBe(0);
    expect(result.current.isRunning).toBe(false);
  });
});
