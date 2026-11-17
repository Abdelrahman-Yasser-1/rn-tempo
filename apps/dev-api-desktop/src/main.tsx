import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ClientProvider } from './client/context';
import { tauriClient } from './client/tauri';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ClientProvider client={tauriClient}>
        <App />
      </ClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
