import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { HttpRequest } from '../api/types';
import { adminRoutes, makeApi, renderWithApi } from '../test/fakeApi';

import { Endpoints } from './Endpoints';
import { messageData } from './LivePanel';

const definition = {
  name: 'shop',
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string' }] }],
  endpoints: [
    { id: 'get.ws', type: 'websocket', method: 'GET', path: '/ws', behavior: 'echo' },
    { id: 'get.live', type: 'sse', method: 'GET', path: '/live', script: [{ data: 'hi' }], on: ['products.created'], retryMs: 3000, heartbeatMs: 15000 },
    { id: 'get.products', type: 'crud', method: 'GET', path: '/products', collection: 'products', action: 'list' },
  ],
};

interface Calls {
  posts: HttpRequest[];
  sends: HttpRequest[];
  drops: HttpRequest[];
}

function setup(clients: unknown[] = []) {
  const calls: Calls = { posts: [], sends: [], drops: [] };
  const api = makeApi({
    admin: adminRoutes({
      'GET /definition': () => definition,
      'GET /scenarios': () => ({ active: {}, endpoints: [] }),
      'GET /users': () => ({ users: [], total: 0, skip: 0, limit: 100 }),
      'POST /endpoints': (request) => (calls.posts.push(request), { ok: true }),
      'GET /realtime/:id/clients': () => ({ type: 'sse', clients }),
      'GET /realtime/:id/messages': () => ({ messages: [{ at: '2026-11-22T10:00:00.000Z', direction: 'event', event: 'products.created', text: '{"id":1}' }] }),
      'POST /realtime/:id/send': (request) => (calls.sends.push(request), { sent: 1 }),
      'DELETE /realtime/:id/clients/:clientId': (request) => (calls.drops.push(request), { ok: true }),
    }),
  });
  renderWithApi(<Endpoints backend="/work/shop" />, api);
  return { api, calls };
}

describe('SSE endpoint form', () => {
  it('AC-LP-7 adds a live events endpoint with its script, events and timing', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog', { name: 'Add endpoint' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'sse');
    expect(within(dialog).getByLabelText(/^Path/)).toHaveValue('/events');
    expect(within(dialog).getByLabelText('Method')).toHaveValue('GET');
    expect(within(dialog).getByLabelText('SSE script')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Send these data changes/), 'products.created');
    fireEvent.change(within(dialog).getByLabelText('SSE script'), { target: { value: '[{"data":"hello"}]' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(JSON.parse(calls.posts[0]?.body ?? '{}')).toMatchObject({ id: 'get.events', type: 'sse', method: 'GET', path: '/events', script: [{ data: 'hello' }], on: ['products.created'], retryMs: 3000, heartbeatMs: 15000 });
  });

  it('AC-LP-7 does not send a script that is not a list', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'sse');
    fireEvent.change(within(dialog).getByLabelText('SSE script'), { target: { value: '{}' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    expect(await within(dialog).findByText('The script is a JSON list: [ ... ].')).toBeInTheDocument();
    expect(calls.posts).toHaveLength(0);
  });
});

describe('WebSocket endpoint form', () => {
  it('AC-LP-7 adds a websocket endpoint with rules, and shows the rules editor only for rules', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog', { name: 'Add endpoint' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'websocket');
    expect(within(dialog).getByLabelText(/^Path/)).toHaveValue('/ws');
    expect(within(dialog).queryByLabelText('WebSocket rules')).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText('What it does with a message'), 'rules');
    fireEvent.change(within(dialog).getByLabelText('WebSocket rules'), { target: { value: '[{"match":{"contains":"hi"},"reply":"hello","broadcast":true}]' } });
    fireEvent.change(within(dialog).getByLabelText('Welcome message'), { target: { value: '{"welcome":true}' } });
    await userEvent.type(within(dialog).getByLabelText(/^Subprotocols/), 'chat.v1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(JSON.parse(calls.posts[0]?.body ?? '{}')).toMatchObject({
      id: 'get.ws.2',
      type: 'websocket',
      method: 'GET',
      path: '/ws',
      behavior: 'rules',
      rules: [{ match: { contains: 'hi' }, reply: 'hello', broadcast: true }],
      onConnect: { welcome: true },
      subprotocols: ['chat.v1'],
      maxPayloadBytes: 65_536,
    });
  });

  it('AC-LP-7 does not send rules that are not a list', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'websocket');
    await userEvent.selectOptions(within(dialog).getByLabelText('What it does with a message'), 'rules');
    fireEvent.change(within(dialog).getByLabelText('WebSocket rules'), { target: { value: '{"a":1}' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    expect(await within(dialog).findByText('The rules is a JSON list: [ ... ].')).toBeInTheDocument();
    expect(calls.posts).toHaveLength(0);
  });
});

describe('Live panel', () => {
  it('AC-LP-7 lists the clients, the recent messages, sends to everyone and disconnects a client', async () => {
    const { calls } = setup([{ id: 'abc12345', connectedAt: '2026-11-22T10:00:00.000Z', ipHash: '0123456789ab', messagesIn: 0, messagesOut: 2 }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Live /live' }));
    const panel = await screen.findByRole('region', { name: 'Live' });
    // A collection endpoint still has Try it; an SSE endpoint has Live instead.
    expect(screen.queryByRole('button', { name: 'Try GET /live' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try GET /products' })).toBeInTheDocument();
    const table = await within(panel).findByRole('table', { name: 'Connected clients' });
    expect(within(table).getByText('abc12345')).toBeInTheDocument();
    expect(within(table).getByText('0123456789ab')).toBeInTheDocument();
    expect(within(panel).getByRole('list', { name: 'Recent messages' })).toHaveTextContent('products.created');
    await userEvent.type(within(panel).getByLabelText(/^Event name/), 'notice');
    fireEvent.change(within(panel).getByLabelText(/^Message/), { target: { value: '{"hi":1}' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(await within(panel).findByText('Sent to 1 client.')).toBeInTheDocument();
    expect(JSON.parse(calls.sends[0]?.body ?? '{}')).toEqual({ data: { hi: 1 }, event: 'notice' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Disconnect abc12345' }));
    await waitFor(() => {
      expect(calls.drops).toHaveLength(1);
    });
    expect(calls.drops[0]?.path).toBe('/realtime/get.live/clients/abc12345');
  });

  it('AC-LP-7 sends to one client when it is picked, and says when nobody is connected', async () => {
    const { calls } = setup([{ id: 'abc12345', connectedAt: '2026-11-22T10:00:00.000Z', ipHash: '0123456789ab', messagesIn: 0, messagesOut: 0 }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Live /live' }));
    const panel = await screen.findByRole('region', { name: 'Live' });
    await within(panel).findByRole('table', { name: 'Connected clients' });
    await userEvent.selectOptions(within(panel).getByLabelText('Send to'), 'abc12345');
    fireEvent.change(within(panel).getByLabelText(/^Message/), { target: { value: 'plain words' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(calls.sends).toHaveLength(1);
    });
    expect(JSON.parse(calls.sends[0]?.body ?? '{}')).toEqual({ data: 'plain words', clientId: 'abc12345' });
  });

  it('AC-LP-7 a websocket endpoint has a Live panel with the send form too', async () => {
    const { calls } = setup([{ id: 'sock0001', connectedAt: '2026-11-22T10:00:00.000Z', ipHash: '0123456789ab', protocol: 'chat', messagesIn: 3, messagesOut: 3 }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Live /ws' }));
    const panel = await screen.findByRole('region', { name: 'Live' });
    expect(await within(panel).findByRole('table', { name: 'Connected clients' })).toHaveTextContent('sock0001');
    fireEvent.change(within(panel).getByLabelText(/^Message/), { target: { value: 'ping' } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(calls.sends).toHaveLength(1);
    });
    expect(calls.sends[0]?.path).toBe('/realtime/get.ws/send');
  });

  it('AC-LP-7 tells a person with nobody connected what to do', async () => {
    setup([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Live /live' }));
    expect(await screen.findByText(/Nobody is connected/)).toBeInTheDocument();
  });

  it('AC-LP-7 sends JSON as JSON and anything else as text', () => {
    expect(messageData('{"a":1}')).toEqual({ a: 1 });
    expect(messageData('hello')).toBe('hello');
    expect(messageData('12')).toBe(12);
  });
});
