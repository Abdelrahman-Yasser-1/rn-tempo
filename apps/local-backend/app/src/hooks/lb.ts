import { useQuery, useQueryClient } from '@tanstack/react-query';

import { adminGet } from '../api/client';
import { useApi } from '../api/context';

export const keys = {
  node: ['node'] as const,
  backends: ['backends'] as const,
  /** Everything read from one backend's admin API; `invalidate(keys.of(path))` refreshes all of it. */
  of: (path: string) => ['backend', path] as const,
  admin: (path: string, ...rest: unknown[]) => ['backend', path, ...rest] as const,
};

export function useNode() {
  const api = useApi();
  return useQuery({ queryKey: keys.node, queryFn: () => api.nodeInfo(false), staleTime: Infinity });
}

/** The list of backends with their state, refreshed every two seconds so a crash shows up. */
export function useBackends() {
  const api = useApi();
  return useQuery({ queryKey: keys.backends, queryFn: () => api.listBackends(), refetchInterval: 2000 });
}

/** Reads one admin route. Runs only while the backend runs. */
export function useAdminQuery<T>(path: string, route: string, options: { enabled?: boolean; refetchInterval?: number } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: keys.admin(path, route),
    queryFn: () => adminGet<T>(api, path, route),
    enabled: options.enabled ?? true,
    ...(options.refetchInterval === undefined ? {} : { refetchInterval: options.refetchInterval }),
  });
}

/** After any save, call this to refresh everything read from the backend (the engine has already hot-reloaded). */
export function useRefresh(path: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.of(path) });
}
