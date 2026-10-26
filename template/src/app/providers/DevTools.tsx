import { useMMKVDevTools } from '@rozenite/mmkv-plugin';
import { useNetworkActivityDevTools } from '@rozenite/network-activity-plugin';
import { useTanStackQueryDevTools } from '@rozenite/tanstack-query-plugin';

import { queryClient } from '@services/http/queryClient';
import { getStorageForDevTools } from '@services/storage/storage';

/** Rozenite inspectors for TanStack Query, MMKV and network activity. Dev builds only; needs storage. */
export function DevTools(): null {
  useTanStackQueryDevTools(queryClient);
  useNetworkActivityDevTools();
  useMMKVDevTools({ storages: [getStorageForDevTools()] });
  return null;
}
