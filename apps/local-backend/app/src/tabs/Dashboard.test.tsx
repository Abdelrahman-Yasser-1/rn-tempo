import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { adminRoutes, makeApi, renderWithApi, RUNNING, STOPPED } from '../test/fakeApi';

import { Dashboard } from './Dashboard';

const stats = {
  requestsPerMinute: 12,
  total: 40,
  errors: 2,
  errorRate: 0.05,
  endpoints: [
    { id: 'get.products', count: 30, errors: 0, p50: 4, p95: 220 },
    { id: 'post.auth.login', count: 10, errors: 2, p50: 90, p95: 1500 },
  ],
  collections: { products: 100 },
};

describe('Dashboard', () => {
  it('a stopped backend has one big Start button and says what to do', async () => {
    const api = makeApi();
    renderWithApi(<Dashboard backend={STOPPED} />, api);
    expect(screen.getByRole('heading', { name: 'Stopped' })).toBeInTheDocument();
    expect(screen.getByText(/Start the backend to see its addresses/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(api.startBackend).toHaveBeenCalledWith('/work/shop', null);
  });

  it('a running backend shows addresses with Copy, a QR code and the numbers', async () => {
    const api = makeApi({
      admin: adminRoutes({
        'GET /stats': () => stats,
        'GET /media/usage': () => ({ files: 3, bytes: 2048, maxBytes: 100 }),
      }),
    });
    renderWithApi(<Dashboard backend={RUNNING} />, api);
    expect(screen.getByRole('heading', { name: 'Running' })).toBeInTheDocument();
    expect(await screen.findByText('https://192.168.1.20:8556')).toBeInTheDocument();
    expect(screen.getByText('https://10.0.2.2:8556')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Copy / })).toHaveLength(4);
    expect(screen.getByRole('img', { name: /QR code for https:\/\/192.168.1.20:8556/ })).toBeInTheDocument();
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('post.auth.login')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(api.stopBackend).toHaveBeenCalledWith('/work/shop');
  });

  it('opens the Swagger page through Rust', async () => {
    const api = makeApi({ admin: adminRoutes({ 'GET /stats': () => stats, 'GET /media/usage': () => ({ files: 0, bytes: 0, maxBytes: 1 }) }) });
    renderWithApi(<Dashboard backend={RUNNING} />, api);
    await userEvent.click(await screen.findByRole('button', { name: /Open the API docs/ }));
    expect(api.openDocs).toHaveBeenCalledWith('/work/shop', 'swagger');
  });

  it('a crash shows the engine message and a Restart button, with a way to try another port', async () => {
    const api = makeApi();
    const crashed = { ...STOPPED, state: 'error' as const, error: 'The engine stopped (exit code 1).\nEADDRINUSE: port 8443 is busy' };
    renderWithApi(<Dashboard backend={crashed} />, api);
    expect(screen.getByRole('alert', { name: 'What went wrong' })).toHaveTextContent('EADDRINUSE');
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(api.startBackend).toHaveBeenCalledWith('/work/shop', null);
    await userEvent.type(screen.getByLabelText('Try another port'), '8557');
    await userEvent.click(screen.getByRole('button', { name: 'Start on this port' }));
    await waitFor(() => {
      expect(api.startBackend).toHaveBeenLastCalledWith('/work/shop', 8557);
    });
  });

  it('a start that fails in Rust shows the message', async () => {
    const api = makeApi({ startBackend: () => Promise.reject(new Error('Node.js was not found.')) });
    renderWithApi(<Dashboard backend={STOPPED} />, api);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Node.js was not found.');
  });
});
