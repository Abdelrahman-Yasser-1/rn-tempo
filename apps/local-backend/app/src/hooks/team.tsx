import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { useApi } from '../api/context';
import { atLeast, type Me, type Role } from '../api/team';

export const meKey = ['me'] as const;

/** The signed-in account of a team server. Without a team server (desktop, local web) there is none. */
export function useMe() {
  const api = useApi();
  const team = api.team;
  return useQuery<Me | null>({
    queryKey: meKey,
    queryFn: () => (team === null ? Promise.resolve(null) : team.me()),
    staleTime: 30_000,
  });
}

/** What the person may do in the backend that is open. Outside a team server everything is allowed (they run it). */
const RoleContext = createContext<Role>('owner');

export function RoleProvider({ role, children }: { role: Role; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export const useRole = (): Role => useContext(RoleContext);

/** The role of the signed-in account on one backend: the owner has every backend, a member has theirs. */
export function useRoleOn(backend: string): Role {
  const api = useApi();
  const me = useMe();
  if (api.team === null) return 'owner';
  const data = me.data;
  if (data === undefined || data === null) return 'viewer';
  if (data.account.owner) return 'owner';
  return data.memberships.find((member) => member.backendId === backend)?.role ?? 'viewer';
}

/** Shows its children only when the role is enough. The server enforces the same rule; this keeps the page from offering what would be refused. */
export function Write({ need = 'editor', children }: { need?: Role; children: ReactNode }) {
  return atLeast(useRole(), need) ? <>{children}</> : null;
}
