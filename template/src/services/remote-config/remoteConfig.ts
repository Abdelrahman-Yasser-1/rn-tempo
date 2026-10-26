import { useQuery } from '@tanstack/react-query';

import { ENV } from '@config/env';
import { request } from '@services/http/request';
import { logger } from '@services/logger/logger';

import { AppConfigSchema, DEFAULT_APP_CONFIG, type AppConfig } from './appConfig';

export const APP_CONFIG_QUERY_KEY = ['app-config'] as const;
const APP_CONFIG_STALE_TIME_MS = 10 * 60_000;

/** Fetches the remote config; on any failure returns the defaults so startup is never blocked. */
export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    return await request({ url: ENV.APP_CONFIG_PATH }, AppConfigSchema);
  } catch (error) {
    logger.warn('App config unavailable, using defaults', error);
    return DEFAULT_APP_CONFIG;
  }
}

/** The remote config via TanStack Query (10 minute stale time). */
export function useAppConfig() {
  return useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: fetchAppConfig,
    staleTime: APP_CONFIG_STALE_TIME_MS,
  });
}
