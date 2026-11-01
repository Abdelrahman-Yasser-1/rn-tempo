import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', async () => {
    const { result } = await renderHook(() => useDebounce('a', 300));
    expect(result.current).toBe('a');
  });

  it('only updates after the value has been stable for the delay', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });
    await rerender({ value: 'ab' });
    await actAsync(() => {
      jest.advanceTimersByTime(299);
    })
    expect(result.current).toBe('a');
    await actAsync(() => {
      jest.advanceTimersByTime(1);
    })
    expect(result.current).toBe('ab');
  });

  it('restarts the wait on every change', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });
    await rerender({ value: 'b' });
    await actAsync(() => {
      jest.advanceTimersByTime(200);
    })
    await rerender({ value: 'c' });
    await actAsync(() => {
      jest.advanceTimersByTime(200);
    })
    expect(result.current).toBe('a');
    await actAsync(() => {
      jest.advanceTimersByTime(100);
    })
    expect(result.current).toBe('c');
  });
});
