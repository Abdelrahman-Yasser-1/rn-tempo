import { queryClient } from '@services/http/queryClient';
import type { AppConfig } from '@services/remote-config/appConfig';
import { APP_CONFIG_QUERY_KEY, fetchAppConfig } from '@services/remote-config/remoteConfig';

const STALE_TIME_MS = 10 * 60_000;

/** Bootstrap step 6: fetch the remote config into the query cache (defaults on failure, never throws). */
export function initRemoteConfig(): Promise<AppConfig> {
  return queryClient.query({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: fetchAppConfig,
    staleTime: STALE_TIME_MS,
  });
}
