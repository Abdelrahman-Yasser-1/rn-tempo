import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ApiProvider } from './api/context';
import { tauriApi } from './api/tauri';
import { App } from './shell/App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={tauriApi}>
        <App />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
