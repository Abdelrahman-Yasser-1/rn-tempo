import { useMMKVDevTools } from '@rozenite/mmkv-plugin';
import { useNetworkActivityDevTools } from '@rozenite/network-activity-plugin';
import { useTanStackQueryDevTools } from '@rozenite/tanstack-query-plugin';

import { queryClient } from '@services/http/queryClient';
import { STORAGE_ID } from '@services/storage/keys';
import { getStorageForDevTools } from '@services/storage/storage';

/** Rozenite inspectors for TanStack Query, MMKV and network activity. Dev builds only; needs storage. */
export function DevTools(): null {
  useTanStackQueryDevTools(queryClient);
  useNetworkActivityDevTools();
  // MMKV v4 instances no longer expose their id, so the plugin needs a record keyed by id.
  useMMKVDevTools({ storages: { [STORAGE_ID]: getStorageForDevTools() } });
  return null;
}
