import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

type NetworkState = {
  /** Device has a network interface up. `null` until the first NetInfo event. */
  isConnected: boolean | null;
  /** The internet is actually reachable (not just Wi-Fi). `null` when unknown. */
  isInternetReachable: boolean | null;
};

/** Connectivity snapshot; WS4's `useIsOnline` reads this store. */
export const useNetworkStore = create<NetworkState>()(() => ({
  isConnected: null,
  isInternetReachable: null,
}));

/** Online unless NetInfo says otherwise: unknown (`null`) counts as online so UI never flashes offline. */
export function selectIsOnline(state: Readonly<NetworkState>): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function apply(state: NetInfoState): void {
  useNetworkStore.setState({
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
  });
}

let unsubscribe: (() => void) | undefined;

/** Subscribes to NetInfo and mirrors it into the store. Idempotent; returns a stop function. */
export function startNetworkMonitoring(): () => void {
  unsubscribe ??= NetInfo.addEventListener(apply);
  return () => {
    unsubscribe?.();
    unsubscribe = undefined;
  };
}
