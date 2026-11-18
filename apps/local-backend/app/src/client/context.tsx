import { createContext, useContext, type ReactNode } from 'react';

import type { Client } from './client';

const ClientContext = createContext<Client | null>(null);

export function ClientProvider({ client, children }: { client: Client; children: ReactNode }) {
  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
  const client = useContext(ClientContext);
  if (client === null) throw new Error('useClient needs a ClientProvider.');
  return client;
}
