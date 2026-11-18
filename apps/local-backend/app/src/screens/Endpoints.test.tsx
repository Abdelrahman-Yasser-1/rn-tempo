import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EndpointSummary, HttpRequest } from '../client/types';
import { jsonReply, makeClient, PROJECT, renderWithClient, RUNNING } from '../test/fakeClient';

import { Endpoints } from './Endpoints';

const ENDPOINTS: EndpointSummary[] = [
  { id: 'get.products', method: 'GET', path: '/products', auth: null, summary: 'List products', tags: ['products'], scenarios: ['notFound', 'serverError'] },
  { id: 'get.products.:id', method: 'GET', path: '/products/:id', auth: null, summary: null, tags: ['products'], scenarios: ['notFound'] },
  { id: 'post.auth.login', method: 'POST', path: '/auth/login', auth: null, summary: 'Sign in', tags: ['auth'], scenarios: ['unauthorized'] },
];

/** A fake server: answers the control routes the screen uses and records what it was sent. */
function server(active: Record<string, string> = {}) {
  const sent: HttpRequest[] = [];
  const control = vi.fn((_project: string, request: HttpRequest) => {
    sent.push(request);
    if (request.path === '/__tempo/endpoints') return Promise.resolve(jsonReply(ENDPOINTS));
    if (request.path === '/__tempo/health') return Promise.resolve(jsonReply({ ok: true, scenarios: active }));
    if (request.path === '/__tempo/scenario') return Promise.resolve(jsonReply({ ok: true, scenarios: {} }));
    if (request.path === '/auth/login') return Promise.resolve(jsonReply({ accessToken: 'tok-123' }));
    if (request.path.startsWith('/products')) return Promise.resolve({ status: 404, body: '{"title":"Not Found"}', ms: 12, contentType: 'application/json' });
    return Promise.reject(new Error('unexpected'));
  });
  return { control, sent, client: makeClient({ projectState: vi.fn(() => Promise.resolve(RUNNING)), control }) };
}

describe('Endpoints', () => {
  it('asks the user to start the server when it is stopped', async () => {
    renderWithClient(<Endpoints project={PROJECT} />, makeClient());
    expect(await screen.findByText(/Start the server/)).toBeInTheDocument();
  });

  it('lists endpoints grouped by tag and filters with the search box', async () => {
    renderWithClient(<Endpoints project={PROJECT} />, server().client);
    expect(await screen.findByRole('region', { name: 'products' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'auth' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search endpoints' }), 'login');
    expect(screen.queryByRole('region', { name: 'products' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'auth' })).toBeInTheDocument();
  });

  it('sets a scenario for one endpoint (AC-DA-2)', async () => {
    const fake = server();
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    await userEvent.selectOptions(await screen.findByLabelText('Scenario for GET /products'), 'notFound');
    await waitFor(() =>
      expect(fake.sent).toContainEqual(expect.objectContaining({ method: 'POST', path: '/__tempo/scenario', body: JSON.stringify({ endpointId: 'get.products', name: 'notFound' }) })),
    );
  });

  it('choosing default clears the scenario', async () => {
    const fake = server({ 'get.products': 'notFound' });
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    const picker = await screen.findByLabelText('Scenario for GET /products');
    await waitFor(() => expect(picker).toHaveValue('notFound'));
    await userEvent.selectOptions(picker, 'default');
    await waitFor(() =>
      expect(fake.sent).toContainEqual(expect.objectContaining({ path: '/__tempo/scenario', body: JSON.stringify({ clear: true, endpointId: 'get.products' }) })),
    );
  });

  it('shows the server problem when a scenario cannot be set', async () => {
    const fake = server();
    fake.control.mockImplementation((_p, request) =>
      request.path === '/__tempo/endpoints'
        ? Promise.resolve(jsonReply(ENDPOINTS))
        : request.path === '/__tempo/health'
          ? Promise.resolve(jsonReply({ scenarios: {} }))
          : Promise.resolve(jsonReply({ detail: 'Unknown scenario "x".' }, 400)),
    );
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    await userEvent.selectOptions(await screen.findByLabelText('Scenario for GET /products'), 'notFound');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown scenario "x".');
  });

  it('tries an endpoint with a path parameter and shows status, time and JSON', async () => {
    const fake = server();
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    await userEvent.click(await screen.findByRole('button', { name: /\/products\/:id/ }));
    const panel = screen.getByRole('region', { name: 'Try it' });
    await userEvent.type(within(panel).getByLabelText('id (path)'), '7');
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    expect(await within(panel).findByText('404')).toBeInTheDocument();
    expect(within(panel).getByText('12 ms')).toBeInTheDocument();
    expect(within(panel).getByText(/"title": "Not Found"/)).toBeInTheDocument();
    expect(fake.sent).toContainEqual(expect.objectContaining({ method: 'GET', path: '/products/7' }));
  });

  it('fills the bearer token from the mock login', async () => {
    const fake = server();
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    await userEvent.click(await screen.findByRole('button', { name: /\/products\/:id/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mock login' }));
    await waitFor(() => expect(screen.getByLabelText('Bearer token')).toHaveValue('tok-123'));
  });

  it('refuses an invalid JSON body before sending', async () => {
    const fake = server();
    renderWithClient(<Endpoints project={PROJECT} />, fake.client);
    await userEvent.click(await screen.findByRole('button', { name: /\/auth\/login/ }));
    await userEvent.type(screen.getByLabelText('JSON body'), '{{oops');
    const before = fake.sent.length;
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON');
    expect(fake.sent).toHaveLength(before);
  });
});
