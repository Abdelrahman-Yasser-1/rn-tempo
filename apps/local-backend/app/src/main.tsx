import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import type { Backend } from './api/client';
import { ApiProvider } from './api/context';
import { browserDeps, createWebTransport } from './api/web';
import { App } from './shell/App';
import { WebGate } from './shell/WebGate';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

/** The web build (`vite build --mode web`) only has the browser transport; the desktop build only has Tauri's. */
async function pickTransport(): Promise<Backend> {
  if (import.meta.env.MODE === 'web') return createWebTransport(browserDeps());
  return (await import('./api/tauri')).tauriApi;
}

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');
const mount = root;

void pickTransport().then((api) => {
  createRoot(mount).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ApiProvider api={api}>
          <WebGate session={api.session}>
            <App />
          </WebGate>
        </ApiProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
});
