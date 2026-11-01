import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useThrottle } from './useThrottle';

describe('useThrottle', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value', async () => {
    const { result } = await renderHook(() => useThrottle('a', 1000));
    expect(result.current).toBe('a');
  });

  it('limits updates to one per interval but never drops the trailing value', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useThrottle(value, 1000),
      {
        initialProps: { value: 'a' },
      },
    );
    // First change goes through right away.
    await rerender({ value: 'b' });
    await actAsync(() => {
      jest.advanceTimersByTime(0);
    });
    expect(result.current).toBe('b');

    // Changes inside the interval are held back ...
    await rerender({ value: 'c' });
    await rerender({ value: 'd' });
    await rerender({ value: 'e' });
    await actAsync(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current).toBe('b');

    // ... and only the latest one is published when the interval ends.
    await actAsync(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('e');
  });
});
