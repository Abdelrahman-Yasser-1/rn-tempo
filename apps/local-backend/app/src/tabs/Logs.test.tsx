import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EventsState, RequestEntry, RequestEvent } from '../api/types';
import { makeApi, renderWithApi, RUNNING, STOPPED } from '../test/fakeApi';

import { Logs } from './Logs';

const entry = (id: number, method: string, url: string, status: number): RequestEntry => ({
  id,
  at: `2026-11-18T08:00:0${String(id)}.000Z`,
  method,
  url,
  status,
  ms: 5 + id,
  req: { headers: { authorization: '[REDACTED]' }, body: { password: '[REDACTED]' } },
  res: { body: { ok: true } },
});

function setup(backend = RUNNING) {
  let push: (event: RequestEvent) => void = () => undefined;
  let state: (event: EventsState) => void = () => undefined;
  const api = makeApi({
    onRequest: (handler) => {
      push = handler;
      return Promise.resolve(() => undefined);
    },
    onEventsState: (handler) => {
      state = handler;
      return Promise.resolve(() => undefined);
    },
    engineLog: () => Promise.resolve(['{"msg":"engine started"}']),
  });
  renderWithApi(<Logs backend={backend} />, api);
  return {
    api,
    send: (item: RequestEntry) => {
      act(() => {
        push({ backend: backend.path, entry: item });
      });
    },
    connect: () => {
      act(() => {
        state({ backend: backend.path, connected: true });
      });
    },
  };
}

describe('Logs', () => {
  it('subscribes through Rust and shows live requests, newest first', async () => {
    const { api, send, connect } = setup();
    await waitFor(() => {
      expect(api.subscribeRequests).toHaveBeenCalledWith('/work/shop');
    });
    expect(screen.getByText(/No requests yet/)).toBeInTheDocument();
    connect();
    send(entry(1, 'GET', '/products?limit=3', 200));
    send(entry(2, 'POST', '/auth/login', 400));
    expect(screen.getByRole('status')).toHaveTextContent('Live. 2 requests kept, 2 shown.');
    const rows = within(screen.getByRole('table', { name: 'Requests' })).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('/auth/login');
    expect(rows[1]).toHaveTextContent('/products?limit=3');
  });

  it('filters by method, status and path', async () => {
    const { send } = setup();
    send(entry(1, 'GET', '/products', 200));
    send(entry(2, 'POST', '/auth/login', 400));
    send(entry(3, 'GET', '/auth/me', 401));
    await userEvent.selectOptions(screen.getByLabelText('Method'), 'GET');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('Status'), '4xx');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('row', { name: /auth\/me/ })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Path contains'), 'products');
    expect(screen.queryByRole('row', { name: /auth\/me/ })).not.toBeInTheDocument();
  });

  it('opens a detail drawer with the redacted request and the answer', async () => {
    const { send } = setup();
    send(entry(1, 'POST', '/auth/login', 200));
    await userEvent.click(screen.getByRole('button', { name: '/auth/login' }));
    const drawer = screen.getByRole('complementary', { name: 'Request detail' });
    expect(drawer).toHaveTextContent('[REDACTED]');
    expect(drawer).toHaveTextContent('"ok": true');
    expect(drawer).not.toHaveTextContent('emilyspass');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close detail' }));
    expect(screen.queryByRole('complementary', { name: 'Request detail' })).not.toBeInTheDocument();
  });

  it('exports the shown requests as JSON through Rust', async () => {
    const { api, send } = setup();
    vi.mocked(api.saveExport).mockResolvedValue('/Users/me/log.json');
    send(entry(1, 'GET', '/products', 200));
    await userEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(await screen.findByText('Saved 1 requests to /Users/me/log.json.')).toBeInTheDocument();
    expect(vi.mocked(api.saveExport).mock.calls[0]?.[1]).toBe('json');
    expect(vi.mocked(api.saveExport).mock.calls[0]?.[2]).toContain('"url": "/products"');
  });

  it('shows the engine log tail and says when the backend is stopped', async () => {
    setup(STOPPED);
    expect(await screen.findByText('{"msg":"engine started"}')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('The backend is stopped.');
  });

  it('Clear empties the list', async () => {
    const { send } = setup();
    send(entry(1, 'GET', '/products', 200));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/No requests yet/)).toBeInTheDocument();
  });
});
