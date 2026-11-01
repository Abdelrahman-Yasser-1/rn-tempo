import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useInterval } from './useInterval';

describe('useInterval', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls the callback every delay', async () => {
    const callback = jest.fn<unknown, []>();
    await renderHook(() => {
      useInterval(callback, 500);
    });
    await actAsync(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('pauses when the delay is null and resumes when it returns', async () => {
    const callback = jest.fn<unknown, []>();
    const { rerender } = await renderHook(
      ({ delay }: { delay: number | null }) => {
        useInterval(callback, delay);
      },
      {
        initialProps: { delay: 100 },
      },
    );
    await rerender({ delay: null });
    await actAsync(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).not.toHaveBeenCalled();
    await rerender({ delay: 100 });
    await actAsync(() => {
      jest.advanceTimersByTime(100);
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('stops on unmount', async () => {
    const callback = jest.fn<unknown, []>();
    const { unmount } = await renderHook(() => {
      useInterval(callback, 100);
    });
    await unmount();
    await actAsync(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(callback).not.toHaveBeenCalled();
  });
});
