import { createContext, useContext, type ReactNode } from 'react';

import type { Api, Capabilities } from './client';

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (api === null) throw new Error('useApi needs an ApiProvider.');
  return api;
}

/** What the current shell (desktop app or browser) can do. Hide or explain whatever it cannot. */
export function useCapabilities(): Capabilities {
  return useApi().capabilities;
}
