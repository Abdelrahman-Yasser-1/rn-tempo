import { renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { useBackHandler } from './useBackHandler';

function backListener(calls: readonly (readonly unknown[])[]) {
  const call = calls.find(([type]) => type === 'hardwareBackPress');
  return call?.[1] as () => boolean;
}

describe('useBackHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to the hardware back press', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    await renderHook(() => { useBackHandler(() => false); });
    expect(addListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
  });

  it('returns the handler result to the platform', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    await renderHook(() => { useBackHandler(() => true); });
    expect(backListener(addListener.mock.calls)()).toBe(true);
  });

  it('calls the latest handler, not the one from the first render', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const { rerender } = await renderHook(({ handler }: { handler: () => boolean }) => { useBackHandler(handler); }, {
      initialProps: { handler: () => false },
    });
    await rerender({ handler: () => true });
    expect(backListener(addListener.mock.calls)()).toBe(true);
  });

  it('removes its subscription on unmount', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const { unmount } = await renderHook(() => { useBackHandler(() => false); });
    const subscription = addListener.mock.results[0]?.value as { remove: () => void };
    const remove = jest.spyOn(subscription, 'remove');
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
