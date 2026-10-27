import { selectIsOnline, useNetworkStore } from '@services/network/network';

/** Whether the device is online; unknown connectivity counts as online. */
export function useIsOnline(): boolean {
  return useNetworkStore(selectIsOnline);
}
