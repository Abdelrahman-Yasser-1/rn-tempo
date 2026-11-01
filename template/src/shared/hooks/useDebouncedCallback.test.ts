import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useDebouncedCallback } from './useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires once after the last call with the last arguments', async () => {
    const callback = jest.fn<unknown, unknown[]>();
    const { result } = await renderHook(() => useDebouncedCallback(callback, 200));
    await actAsync(() => {
      result.current.run('a');
      result.current.run('b');
    });
    await actAsync(() => {
      jest.advanceTimersByTime(199);
    });
    expect(callback).not.toHaveBeenCalled();
    await actAsync(() => {
      jest.advanceTimersByTime(1);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('b');
  });

  it('cancel drops a pending call', async () => {
    const callback = jest.fn<unknown, unknown[]>();
    const { result } = await renderHook(() => useDebouncedCallback(callback, 200));
    await actAsync(() => {
      result.current.run();
      result.current.cancel();
    });
    await actAsync(() => {
      jest.advanceTimersByTime(500);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels a pending call when unmounted', async () => {
    const callback = jest.fn<unknown, unknown[]>();
    const { result, unmount } = await renderHook(() => useDebouncedCallback(callback, 200));
    await actAsync(() => {
      result.current.run();
    });
    await unmount();
    await actAsync(() => {
      jest.advanceTimersByTime(500);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('calls the latest callback, not the one from the first render', async () => {
    const first = jest.fn<unknown, unknown[]>();
    const second = jest.fn<unknown, unknown[]>();
    const { result, rerender } = await renderHook(
      ({ fn }: { fn: (...args: unknown[]) => void }) => useDebouncedCallback(fn, 100),
      {
        initialProps: { fn: first },
      },
    );
    await actAsync(() => {
      result.current.run();
    });
    await rerender({ fn: second });
    await actAsync(() => {
      jest.advanceTimersByTime(100);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
