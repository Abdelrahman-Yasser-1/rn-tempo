import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EventsState, RequestEntry, RequestEvent } from '../client/types';
import { makeClient, PROJECT, renderWithClient, RUNNING } from '../test/fakeClient';

import { Requests } from './Requests';

const entry = (id: number, overrides: Partial<RequestEntry> = {}): RequestEntry => ({
  id,
  at: `2026-01-01T10:00:0${id}.000Z`,
  method: 'GET',
  url: '/products',
  status: 200,
  ms: 4,
  req: { headers: { authorization: '[redacted]' }, body: undefined },
  res: { body: { items: [] } },
  ...overrides,
});

function setup() {
  let emit: (event: RequestEvent) => void = () => undefined;
  let emitState: (event: EventsState) => void = () => undefined;
  const subscribeEvents = vi.fn(() => Promise.resolve());
  const unsubscribeEvents = vi.fn(() => Promise.resolve());
  const client = makeClient({
    projectState: vi.fn(() => Promise.resolve(RUNNING)),
    subscribeEvents,
    unsubscribeEvents,
    onRequest: vi.fn((handler: (event: RequestEvent) => void) => {
      emit = handler;
      return Promise.resolve(() => undefined);
    }),
    onEventsState: vi.fn((handler: (event: EventsState) => void) => {
      emitState = handler;
      return Promise.resolve(() => undefined);
    }),
  });
  return { client, subscribeEvents, unsubscribeEvents, emit: (e: RequestEntry, project = PROJECT.path) => act(() => emit({ project, entry: e })), emitState: (connected: boolean) => act(() => emitState({ project: PROJECT.path, connected })) };
}

describe('Requests', () => {
  it('subscribes on mount and unsubscribes on unmount', async () => {
    const { client, subscribeEvents, unsubscribeEvents } = setup();
    const view = renderWithClient(<Requests project={PROJECT} />, client);
    await waitFor(() => expect(subscribeEvents).toHaveBeenCalledWith('/work/demo'));
    view.unmount();
    expect(unsubscribeEvents).toHaveBeenCalledWith('/work/demo');
  });

  it('shows a request as it arrives, newest first, and ignores other projects', async () => {
    const fake = setup();
    renderWithClient(<Requests project={PROJECT} />, fake.client);
    await waitFor(() => expect(fake.subscribeEvents).toHaveBeenCalled());
    fake.emitState(true);
    fake.emit(entry(1, { url: '/first' }));
    fake.emit(entry(2, { url: '/second' }));
    fake.emit(entry(3, { url: '/other' }), '/work/other');
    const rows = within(screen.getByRole('table', { name: 'Requests' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('/second');
    expect(screen.getByRole('status')).toHaveTextContent('Live.');
  });

  it('filters by status and path text', async () => {
    const fake = setup();
    renderWithClient(<Requests project={PROJECT} />, fake.client);
    await waitFor(() => expect(fake.subscribeEvents).toHaveBeenCalled());
    fake.emit(entry(1, { url: '/ok' }));
    fake.emit(entry(2, { url: '/missing', status: 404 }));
    await userEvent.selectOptions(screen.getByLabelText('Status'), '4xx');
    expect(screen.getByText('/missing')).toBeInTheDocument();
    expect(screen.queryByText('/ok')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'all');
    await userEvent.type(screen.getByLabelText('Path contains'), 'ok');
    expect(screen.queryByText('/missing')).not.toBeInTheDocument();
  });

  it('opens a detail drawer with the redacted request and response', async () => {
    const fake = setup();
    renderWithClient(<Requests project={PROJECT} />, fake.client);
    await waitFor(() => expect(fake.subscribeEvents).toHaveBeenCalled());
    fake.emit(entry(1, { url: '/products?limit=2' }));
    await userEvent.click(screen.getByRole('button', { name: '/products?limit=2' }));
    const drawer = screen.getByRole('complementary', { name: 'Request detail' });
    expect(within(drawer).getByText(/\[redacted\]/)).toBeInTheDocument();
    expect(within(drawer).getByText(/"items": \[\]/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Close detail' }));
    expect(screen.queryByRole('complementary', { name: 'Request detail' })).not.toBeInTheDocument();
  });

  it('clears the list', async () => {
    const fake = setup();
    renderWithClient(<Requests project={PROJECT} />, fake.client);
    await waitFor(() => expect(fake.subscribeEvents).toHaveBeenCalled());
    fake.emit(entry(1));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('status')).toHaveTextContent('0 requests kept');
  });
});
