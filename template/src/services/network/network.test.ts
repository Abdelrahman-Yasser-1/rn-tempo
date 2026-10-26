import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { renderHook } from '@testing-library/react-native';

import { selectIsOnline, startNetworkMonitoring, useNetworkStore } from './network';

const addListener = jest.mocked(NetInfo.addEventListener);

beforeEach(() => {
  useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
});

describe('network store', () => {
  test('starts unknown, which counts as online', () => {
    expect(selectIsOnline(useNetworkStore.getState())).toBe(true);
  });

  test('mirrors NetInfo events', () => {
    const stop = startNetworkMonitoring();
    const listener = addListener.mock.calls.at(-1)?.[0];

    listener?.({ isConnected: false, isInternetReachable: false } as NetInfoState);
    expect(useNetworkStore.getState()).toEqual({ isConnected: false, isInternetReachable: false });
    expect(selectIsOnline(useNetworkStore.getState())).toBe(false);

    listener?.({ isConnected: true, isInternetReachable: null } as NetInfoState);
    expect(selectIsOnline(useNetworkStore.getState())).toBe(true);
    stop();
  });

  test('connected but internet unreachable is offline', () => {
    useNetworkStore.setState({ isConnected: true, isInternetReachable: false });

    expect(selectIsOnline(useNetworkStore.getState())).toBe(false);
  });

  test('startNetworkMonitoring subscribes once and the stop function unsubscribes', () => {
    const unsubscribeSpy = jest.fn();
    addListener.mockClear();
    addListener.mockReturnValueOnce(unsubscribeSpy);

    const stop = startNetworkMonitoring();
    const stopAgain = startNetworkMonitoring();

    expect(addListener).toHaveBeenCalledTimes(1);
    stop();
    stopAgain();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  test('components can select online state reactively', async () => {
    const { result } = await renderHook(() => useNetworkStore(selectIsOnline));

    expect(result.current).toBe(true);
  });
});
