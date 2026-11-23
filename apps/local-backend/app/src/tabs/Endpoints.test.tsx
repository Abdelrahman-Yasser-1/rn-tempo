import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest } from '../api/types';
import { adminRoutes, makeApi, reply, renderWithApi } from '../test/fakeApi';

import { Endpoints } from './Endpoints';

const definition = {
  name: 'shop',
  collections: [{ name: 'products', fields: [{ name: 'title', type: 'string' }, { name: 'price', type: 'number' }, { name: 'owner', type: 'number' }] }],
  endpoints: [
    { id: 'get.products', type: 'crud', method: 'GET', path: '/products', collection: 'products', action: 'list', summary: 'All products' },
    { id: 'get.app-config', type: 'static', method: 'GET', path: '/app-config', status: 200, body: { maintenance: false } },
    { id: 'post.auth.login', type: 'auth', method: 'POST', path: '/auth/login', action: 'login' },
  ],
};

interface Calls {
  posts: HttpRequest[];
  puts: HttpRequest[];
  deletes: HttpRequest[];
  scenarioPuts: HttpRequest[];
}

function setup(extra: Record<string, (r: HttpRequest, p: Record<string, string>) => unknown> = {}) {
  const calls: Calls = { posts: [], puts: [], deletes: [], scenarioPuts: [] };
  const api = makeApi({
    admin: adminRoutes({
      'GET /definition': () => definition,
      'GET /scenarios': () => ({ active: { 'get.products': 'slow' }, endpoints: definition.endpoints.map((e) => ({ id: e.id, scenarios: ['notFound', 'slow'] })) }),
      'POST /endpoints': (request) => (calls.posts.push(request), { ok: true }),
      'PUT /endpoints/:id': (request) => (calls.puts.push(request), { ok: true }),
      'DELETE /endpoints/:id': (request) => (calls.deletes.push(request), { ok: true }),
      'PUT /scenarios/:id': (request) => (calls.scenarioPuts.push(request), { ok: true }),
      'DELETE /scenarios/:id': (request) => (calls.scenarioPuts.push(request), { ok: true }),
      'GET /users': () => ({ users: [{ id: 1, username: 'emilys' }], total: 1, skip: 0, limit: 100 }),
      ...extra,
    }),
  });
  renderWithApi(<Endpoints backend="/work/shop" />, api);
  return { api, calls };
}

describe('Endpoints', () => {
  it('lists method, path, type, sign-in and the one-line note', async () => {
    setup();
    const row = (await screen.findByRole('cell', { name: '/products' })).closest('tr');
    if (row === null) throw new Error('no row');
    expect(within(row).getByText('GET')).toBeInTheDocument();
    expect(within(row).getByText('Collection')).toBeInTheDocument();
    expect(within(row).getByText('All products')).toBeInTheDocument();
    expect(screen.getByText('Fixed answer')).toBeInTheDocument();
  });

  it('adds a fixed-answer endpoint: the form changes with the type', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog', { name: 'Add endpoint' });
    // A collection endpoint asks for a collection and an action.
    expect(within(dialog).getByLabelText(/^Collection/)).toHaveValue('products');
    expect(within(dialog).getByLabelText('Action')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('JSON body')).not.toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'static');
    expect(within(dialog).queryByLabelText('Action')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Status')).toHaveValue('200');
    expect(within(dialog).getByLabelText('JSON body')).toBeInTheDocument();
    const path = within(dialog).getByLabelText(/^Path/);
    await userEvent.clear(path);
    await userEvent.type(path, '/ping');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(JSON.parse(calls.posts[0]?.body ?? '{}')).toEqual({ id: 'get.ping', type: 'static', method: 'GET', path: '/ping', auth: 'none', status: 200, body: { ok: true } });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('each type shows its own fields', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog');
    const type = within(dialog).getByLabelText(/^What should it do/);
    await userEvent.selectOptions(type, 'handler');
    expect(within(dialog).getByLabelText('File name')).toHaveValue('handlers/hello.js');
    expect(within(dialog).getByLabelText('Time limit (ms)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create file from example' })).toBeInTheDocument();
    await userEvent.selectOptions(type, 'auth');
    expect(within(dialog).getByLabelText(/^Step/)).toHaveValue('login');
    expect(within(dialog).getByLabelText(/^Path/)).toHaveValue('/auth/login');
    await userEvent.selectOptions(type, 'upload');
    expect(within(dialog).getByLabelText('Accept several files at once')).toBeInTheDocument();
    await userEvent.selectOptions(type, 'crud');
    await userEvent.selectOptions(within(dialog).getByLabelText('Action'), 'update');
    expect(within(dialog).getByLabelText(/^Path/)).toHaveValue('/products/:id');
    expect(within(dialog).getByLabelText('Method')).toHaveValue('PUT');
    expect(within(dialog).getByLabelText(/^Owner field/)).toBeInTheDocument();
  });

  it('creates a handler file from the example', async () => {
    const { api } = setup();
    vi.mocked(api.createHandler).mockResolvedValue('handlers/hello.js');
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    await userEvent.selectOptions(screen.getByLabelText(/^What should it do/), 'handler');
    await userEvent.click(screen.getByRole('button', { name: 'Create file from example' }));
    expect(await screen.findByText(/Created handlers\/hello.js/)).toBeInTheDocument();
    expect(api.createHandler).toHaveBeenCalledWith('/work/shop', 'hello.js');
  });

  it('shows a plain problem for a bad path and bad JSON without calling the engine', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^What should it do/), 'static');
    const path = within(dialog).getByLabelText(/^Path/);
    await userEvent.clear(path);
    await userEvent.type(path, 'ping');
    await userEvent.clear(within(dialog).getByLabelText('JSON body'));
    await userEvent.type(within(dialog).getByLabelText('JSON body'), 'not json');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    expect(await within(dialog).findByText(/A path starts with "\/"/)).toBeInTheDocument();
    expect(within(dialog).getByText('The body is not valid JSON.')).toBeInTheDocument();
    expect(calls.posts).toHaveLength(0);
  });

  it('shows the engine message when it refuses a save', async () => {
    setup({ 'POST /endpoints': () => reply({ detail: 'Another endpoint already answers GET /ping.' }, 400) });
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    await userEvent.selectOptions(screen.getByLabelText(/^What should it do/), 'download');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add endpoint' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another endpoint already answers GET /ping.');
  });

  it('edits an endpoint with PUT and keeps its settings', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /app-config' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    expect(within(dialog).getByLabelText('JSON body')).toHaveValue('{\n  "maintenance": false\n}');
    await userEvent.clear(within(dialog).getByLabelText('Status'));
    await userEvent.type(within(dialog).getByLabelText('Status'), '503');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => {
      expect(calls.puts).toHaveLength(1);
    });
    expect(calls.puts[0]?.path).toBe('/endpoints/get.app-config');
    expect(JSON.parse(calls.puts[0]?.body ?? '{}')).toMatchObject({ id: 'get.app-config', status: 503, body: { maintenance: false } });
  });

  it('edits the faults of an endpoint and keeps a failure body from the JSON', async () => {
    const withFaults = { ...definition, endpoints: [{ ...definition.endpoints[1], faults: { failureBody: { error: 'down' }, rateLimit: null } }, definition.endpoints[0]] };
    const { calls } = setup({ 'GET /definition': () => withFaults });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /app-config' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    const faults = within(dialog).getByRole('group', { name: 'Faults' });
    expect(within(faults).getByLabelText('Rate limit')).toHaveValue('off');
    await userEvent.selectOptions(within(faults).getByLabelText('Rate limit'), 'own');
    await userEvent.clear(within(faults).getByLabelText('Requests'));
    await userEvent.type(within(faults).getByLabelText('Requests'), '10');
    await userEvent.type(within(faults).getByLabelText('Failure rate (%)'), '20');
    await userEvent.type(within(faults).getByLabelText('Failure status'), '503');
    await userEvent.selectOptions(within(faults).getByLabelText('Offline'), 'off');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => {
      expect(calls.puts).toHaveLength(1);
    });
    expect(JSON.parse(calls.puts[0]?.body ?? '{}')).toMatchObject({
      faults: { rateLimit: { requests: 10, perSeconds: 60, key: 'ip' }, failureRate: 0.2, failureStatus: 503, failureBody: { error: 'down' }, offline: false },
    });
  });

  it('shows a faults problem and does not save', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /app-config' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    await userEvent.type(within(dialog).getByLabelText('Failure status'), '700');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save endpoint' }));
    expect(await within(dialog).findByText(/400 to 599/)).toBeInTheDocument();
    expect(calls.puts).toHaveLength(0);
  });

  it('summarises own faults on the endpoint details', async () => {
    const withFaults = { ...definition, endpoints: [{ ...definition.endpoints[1], faults: { failureRate: 0.2, failureStatus: 503, rateLimit: { requests: 10, perSeconds: 60, key: 'ip' } } }] };
    setup({ 'GET /definition': () => withFaults });
    await userEvent.click(await screen.findByRole('button', { name: /Details/ }));
    expect(await screen.findByLabelText('Endpoint faults')).toHaveTextContent('Faults: 20% fail (503), limit 10/60s per ip');
  });

  it('duplicates into a new endpoint with a copy path', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate GET /app-config' }));
    const dialog = screen.getByRole('dialog', { name: 'Duplicate endpoint' });
    expect(within(dialog).getByLabelText(/^Path/)).toHaveValue('/app-config-copy');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add endpoint' }));
    await waitFor(() => {
      expect(calls.posts).toHaveLength(1);
    });
    expect(JSON.parse(calls.posts[0]?.body ?? '{}')).toMatchObject({ id: 'get.app-config-copy', path: '/app-config-copy' });
  });

  it('deleting asks first and names what stops answering', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete GET /app-config' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this endpoint?' });
    expect(dialog).toHaveTextContent('GET /app-config');
    expect(dialog).toHaveTextContent('stops answering');
    expect(calls.deletes).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete endpoint' }));
    await waitFor(() => {
      expect(calls.deletes).toHaveLength(1);
    });
    expect(calls.deletes[0]?.path).toBe('/endpoints/get.app-config');
  });

  it('switches a scenario, and back to the normal answer', async () => {
    const { calls } = setup();
    const picker = await screen.findByLabelText('Scenario for GET /products');
    expect(picker).toHaveValue('slow');
    await userEvent.selectOptions(picker, '');
    await waitFor(() => {
      expect(calls.scenarioPuts[0]?.method).toBe('DELETE');
    });
    await userEvent.selectOptions(screen.getByLabelText('Scenario for GET /app-config'), 'notFound');
    await waitFor(() => {
      expect(calls.scenarioPuts[1]?.method).toBe('PUT');
    });
    expect(JSON.parse(calls.scenarioPuts[1]?.body ?? '{}')).toEqual({ name: 'notFound' });
  });

  it('Try it logs in as an app user and sends the request through the public proxy', async () => {
    const { api } = setup({ 'POST /users/:id/token': () => ({ accessToken: 'tok-123', expiresInMins: 30 }) });
    vi.mocked(api.tryIt).mockResolvedValue(reply({ products: [], total: 0 }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try GET /products' }));
    const panel = screen.getByRole('region', { name: 'Try it' });
    expect(within(panel).getByLabelText('Path')).toHaveValue('/products');
    await userEvent.type(within(panel).getByLabelText(/^Query/), 'limit=5');
    await userEvent.selectOptions(await within(panel).findByLabelText('Log in as…'), 'emilys');
    await waitFor(() => {
      expect(within(panel).getByLabelText('Bearer token')).toHaveValue('tok-123');
    });
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(await within(panel).findByText('200')).toBeInTheDocument();
    expect(api.tryIt).toHaveBeenCalledWith('/work/shop', { method: 'GET', path: '/products?limit=5', headers: [['authorization', 'Bearer tok-123']], body: null });
  });
});
