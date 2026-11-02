import NetInfo from '@react-native-community/netinfo';
import { act, renderHook } from '@testing-library/react-native';

import { useNetworkStore } from '@services/network/network';

import { useConnectionModal } from './useConnectionModal';

const OFFLINE = { isConnected: false, isInternetReachable: false };
const ONLINE = { isConnected: true, isInternetReachable: true };
const DELAY_MS = 1000;

/** Advances fake time inside act so the timer's state update commits. */
const advance = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
    return Promise.resolve();
  });

const goOffline = () =>
  act(() => {
    useNetworkStore.setState(OFFLINE);
    return Promise.resolve();
  });

const goOnline = () =>
  act(() => {
    useNetworkStore.setState(ONLINE);
    return Promise.resolve();
  });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  useNetworkStore.setState(ONLINE);
});

afterEach(() => {
  jest.useRealTimers();
  useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
});

describe('useConnectionModal', () => {
  test('stays hidden while online', async () => {
    const { result } = await renderHook(() => useConnectionModal({ delayMs: DELAY_MS }));

    await advance(DELAY_MS * 2);

    expect(result.current.isVisible).toBe(false);
  });

  test('appears only after being offline for the delay', async () => {
    const { result } = await renderHook(() => useConnectionModal({ delayMs: DELAY_MS }));

    await goOffline();
    await advance(DELAY_MS - 1);
    expect(result.current.isVisible).toBe(false);

    await advance(1);
    expect(result.current.isVisible).toBe(true);
  });

  test('closes by itself when the connection returns', async () => {
    const { result } = await renderHook(() => useConnectionModal({ delayMs: DELAY_MS }));
    await goOffline();
    await advance(DELAY_MS);
    expect(result.current.isVisible).toBe(true);

    await goOnline();

    expect(result.current.isVisible).toBe(false);
  });

  test('going back online before the delay cancels the pending modal', async () => {
    const { result } = await renderHook(() => useConnectionModal({ delayMs: DELAY_MS }));
    await goOffline();
    await advance(DELAY_MS - 1);

    await goOnline();
    await advance(DELAY_MS);

    expect(result.current.isVisible).toBe(false);
  });

  test('never appears when disabled', async () => {
    const { result } = await renderHook(() =>
      useConnectionModal({ enabled: false, delayMs: DELAY_MS }),
    );

    await goOffline();
    await advance(DELAY_MS * 2);

    expect(result.current.isVisible).toBe(false);
  });

  test('uses the default delay of 5 seconds', async () => {
    const { result } = await renderHook(() => useConnectionModal({}));

    await goOffline();
    await advance(4999);
    expect(result.current.isVisible).toBe(false);

    await advance(1);
    expect(result.current.isVisible).toBe(true);
  });

  test('retry refreshes the connection check and calls onRetry', async () => {
    const refresh = jest.spyOn(NetInfo, 'refresh').mockResolvedValue({} as never);
    const onRetry = jest.fn();
    const { result } = await renderHook(() => useConnectionModal({ onRetry }));

    result.current.onRetryPress();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    refresh.mockRestore();
  });

  test('retry works without an onRetry handler', async () => {
    const refresh = jest.spyOn(NetInfo, 'refresh').mockResolvedValue({} as never);
    const { result } = await renderHook(() => useConnectionModal({}));

    result.current.onRetryPress();

    expect(refresh).toHaveBeenCalledTimes(1);
    refresh.mockRestore();
  });
});
