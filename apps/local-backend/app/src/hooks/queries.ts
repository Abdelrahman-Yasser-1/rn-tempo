import { useQuery } from '@tanstack/react-query';

import { useClient } from '../client/context';
import type { EndpointSummary, ServerInfo } from '../client/types';
import { controlJson } from '../lib/server';

export const keys = {
  node: ['node'] as const,
  recents: ['recents'] as const,
  state: (project: string) => ['state', project] as const,
  info: (project: string, pid: number | null) => ['info', project, pid] as const,
  endpoints: (project: string, pid: number | null) => ['endpoints', project, pid] as const,
};

export function useNode() {
  const client = useClient();
  return useQuery({ queryKey: keys.node, queryFn: () => client.nodeInfo(false), staleTime: Infinity });
}

export function useRecents() {
  const client = useClient();
  return useQuery({ queryKey: keys.recents, queryFn: () => client.listRecents() });
}

/** Whether the project's server runs. Polled, because the CLI or another window may change it. */
export function useProjectState(project: string, intervalMs = 2000) {
  const client = useClient();
  return useQuery({
    queryKey: keys.state(project),
    queryFn: () => client.projectState(project),
    refetchInterval: intervalMs,
  });
}

/** `/__tempo/info` of the running server. Keyed by pid so a restart shows the new server's values. */
export function useServerInfo(project: string, pid: number | null) {
  const client = useClient();
  return useQuery({
    queryKey: keys.info(project, pid),
    enabled: pid !== null,
    queryFn: () => controlJson<ServerInfo>(client, project, { method: 'GET', path: '/__tempo/info' }),
    refetchInterval: 10_000,
  });
}

export function useEndpoints(project: string, pid: number | null) {
  const client = useClient();
  return useQuery({
    queryKey: keys.endpoints(project, pid),
    enabled: pid !== null,
    queryFn: () => controlJson<EndpointSummary[]>(client, project, { method: 'GET', path: '/__tempo/endpoints' }),
  });
}
