import { renderHook } from '@testing-library/react-native';

import { useNetworkStore } from '@services/network/network';
import { actAsync } from '@test-utils/act';


import { useIsOnline } from './useIsOnline';

describe('useIsOnline', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isConnected: null, isInternetReachable: null });
  });

  it('counts unknown connectivity as online', async () => {
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it('is offline when the device has no connection', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: null });
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it('is offline when the internet is unreachable', async () => {
    useNetworkStore.setState({ isConnected: true, isInternetReachable: false });
    const { result } = await renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it('follows the store as connectivity changes', async () => {
    const { result } = await renderHook(() => useIsOnline());
    await actAsync(() => {
      useNetworkStore.setState({ isConnected: false, isInternetReachable: false })
    });
    expect(result.current).toBe(false);
    await actAsync(() => {
      useNetworkStore.setState({ isConnected: true, isInternetReachable: true })
    });
    expect(result.current).toBe(true);
  });
});
