import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest } from '../api/types';
import { RoleProvider } from '../hooks/team';
import { adminRoutes, makeApi, renderWithApi, RUNNING } from '../test/fakeApi';

import { Inbox, prettyBody } from './Inbox';
import { SettingsFaults } from './SettingsFaults';
import { SettingsOauth } from './SettingsOauth';
import { SettingsPush } from './SettingsPush';
import { SettingsWebhooks } from './SettingsWebhooks';

const body = (request: HttpRequest | undefined): Record<string, unknown> => JSON.parse(request?.body ?? '{}') as Record<string, unknown>;

describe('Settings: webhooks', () => {
  it('AC-LP-8 creates a webhook, shows the signing secret once, and sends a test event', async () => {
    const posts: HttpRequest[] = [];
    const tests: HttpRequest[] = [];
    const api = makeApi({
      admin: adminRoutes({
        'GET /webhooks': () => [{ id: 'orders', url: 'https://hooks.test/orders?token=***', events: ['products.created'], enabled: true, retries: { max: 3, baseMs: 1000 }, secretConfigured: true }],
        'GET /webhook-deliveries': () => [{ id: 'whd_1', webhookId: 'orders', event: 'products.created', status: 'failed', attempt: 4, attempts: [{ n: 4, ms: 5, code: 500 }] }],
        'POST /webhooks': (request) => (posts.push(request), { webhook: {}, secret: 'whsec_shown_once_123' }),
        'POST /webhooks/:id/test': (request) => (tests.push(request), {}),
        'POST /webhook-deliveries/:id/redeliver': () => ({}),
      }),
    });
    renderWithApi(<SettingsWebhooks backend={RUNNING} />, api);
    expect(await screen.findByRole('table', { name: 'Webhooks list' })).toBeInTheDocument();
    expect(screen.getByText(/failed \(500\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add webhook' }));
    const form = screen.getByRole('form', { name: 'Webhook form' });
    await userEvent.type(within(form).getByLabelText('Id'), 'late');
    await userEvent.type(within(form).getByLabelText(/^URL/), 'http://localhost:8557/hook');
    await userEvent.clear(within(form).getByLabelText(/^Events/));
    await userEvent.type(within(form).getByLabelText(/^Events/), 'products.*, custom.shipped');
    await userEvent.click(within(form).getByRole('button', { name: 'Save webhook' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(body(posts[0])).toMatchObject({ id: 'late', url: 'http://localhost:8557/hook', events: ['products.*', 'custom.shipped'], retries: { max: 3 } });
    expect(await screen.findByText('whsec_shown_once_123')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('whsec_shown_once_123')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Send test to orders' }));
    await waitFor(() => expect(tests).toHaveLength(1));
  });

  it('AC-LP-8 refuses bad retries before calling the engine, and only admins see Rotate', async () => {
    const posts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /webhooks': () => [{ id: 'orders', url: 'https://x.test', events: ['*'], enabled: true, retries: { max: 3, baseMs: 1000 }, secretConfigured: true }], 'GET /webhook-deliveries': () => [], 'POST /webhooks': (request) => (posts.push(request), {}) }) });
    renderWithApi(
      <RoleProvider role="editor">
        <SettingsWebhooks backend={RUNNING} />
      </RoleProvider>,
      api,
    );
    await screen.findByRole('table', { name: 'Webhooks list' });
    expect(screen.queryByRole('button', { name: /Rotate secret/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add webhook' }));
    const form = screen.getByRole('form', { name: 'Webhook form' });
    await userEvent.type(within(form).getByLabelText('Id'), 'x');
    await userEvent.clear(within(form).getByLabelText('Retries'));
    await userEvent.type(within(form).getByLabelText('Retries'), '99');
    await userEvent.click(within(form).getByRole('button', { name: 'Save webhook' }));
    expect(await screen.findByText('Retries is a number from 0 to 10.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('AC-LP-8 rotates a secret (admin) and shows the new one once', async () => {
    const api = makeApi({ admin: adminRoutes({ 'GET /webhooks': () => [{ id: 'orders', url: 'https://x.test', events: ['*'], enabled: true, retries: { max: 3, baseMs: 1000 }, secretConfigured: true }], 'GET /webhook-deliveries': () => [], 'POST /webhooks/:id/rotate-secret': () => ({ secret: 'whsec_new_999' }) }) });
    renderWithApi(<SettingsWebhooks backend={RUNNING} />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Rotate secret of orders' }));
    expect(await screen.findByText('whsec_new_999')).toBeInTheDocument();
  });
});

describe('Settings: push', () => {
  const status = { fcm: { configured: false }, apns: { configured: true, keyId: 'ABC123DEFG', teamId: 'TEAM123456', bundleId: 'com.example.app' }, history: [{ id: 1, at: '2025-01-01T00:00:00Z', platform: 'apns', token: '****abab', status: 400, ok: false, reason: 'BadDeviceToken' }] };

  it('AC-LP-9 shows only "configured" and ids, never the credential, and lists the history with masked tokens', async () => {
    renderWithApi(<SettingsPush backend={RUNNING} />, makeApi({ admin: adminRoutes({ 'GET /push': () => status }) }));
    expect(await screen.findByText(/Configured: key ABC123DEFG, team TEAM123456, com.example.app/)).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('****abab')).toBeInTheDocument();
    expect(screen.getByText('400 BadDeviceToken')).toBeInTheDocument();
  });

  it('AC-LP-9 uploads credentials (and clears the boxes), deletes them, and sends a test showing the provider answer', async () => {
    const puts: HttpRequest[] = [];
    const sends: HttpRequest[] = [];
    const deletes: string[] = [];
    const api = makeApi({
      admin: adminRoutes({
        'GET /push': () => status,
        'PUT /push/:platform': (request) => (puts.push(request), status),
        'DELETE /push/:platform': (request) => (deletes.push(request.path), status),
        'POST /push/send': (request) => (sends.push(request), { ok: false, status: 410, reason: 'Unregistered' }),
      }),
    });
    renderWithApi(<SettingsPush backend={RUNNING} />, api);
    await screen.findByText(/Configured: key/);
    await userEvent.type(screen.getByLabelText('Service account JSON'), 'not-real');
    await userEvent.click(screen.getByRole('button', { name: 'Save service account' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(body(puts[0])).toEqual({ serviceAccount: 'not-real' });
    await waitFor(() => expect(screen.getByLabelText('Service account JSON')).toHaveValue(''));
    await userEvent.click(screen.getByRole('button', { name: 'Delete APNs credentials' }));
    await waitFor(() => expect(deletes).toEqual(['/push/apns']));
    const form = screen.getByRole('form', { name: 'Send test push' });
    await userEvent.selectOptions(within(form).getByLabelText('Platform'), 'apns');
    await userEvent.type(within(form).getByLabelText('Device token'), 'ab'.repeat(32));
    await userEvent.type(within(form).getByLabelText('Title'), 'Hi');
    await userEvent.click(within(form).getByLabelText(/Sandbox/));
    await userEvent.click(within(form).getByRole('button', { name: 'Send test' }));
    await waitFor(() => expect(sends).toHaveLength(1));
    expect(body(sends[0])).toMatchObject({ platform: 'apns', title: 'Hi', sandbox: false });
    expect(await screen.findByRole('status', { name: 'Push result' })).toHaveTextContent('Refused: status 410, Unregistered');
  });

  it('AC-LP-9 refuses data that is not JSON before sending', async () => {
    const sends: HttpRequest[] = [];
    renderWithApi(<SettingsPush backend={RUNNING} />, makeApi({ admin: adminRoutes({ 'GET /push': () => status, 'POST /push/send': (request) => (sends.push(request), {}) }) }));
    await screen.findByText(/Configured: key/);
    const form = screen.getByRole('form', { name: 'Send test push' });
    await userEvent.type(within(form).getByLabelText('Device token'), 'a-token-value-1234567890');
    await userEvent.type(within(form).getByLabelText(/^Data/), 'nope');
    await userEvent.click(within(form).getByRole('button', { name: 'Send test' }));
    expect(await screen.findByText('Data must be a JSON object.')).toBeInTheDocument();
    expect(sends).toHaveLength(0);
  });
});

describe('Settings: faults, CORS and sessions', () => {
  const definition = { name: 'shop', port: 8556, https: true, auth: { accessTtlMin: 30 }, endpoints: [], collections: [] };

  it('AC-LP-10 saves a rate limit, a failure rate and CORS through the faults settings route, and shows the counts', async () => {
    const puts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /stats': () => ({ faults: { rateLimited: 3, failed: 2, dropped: 1, offline: 0 } }), 'PUT /settings/faults': (request) => (puts.push(request), {}) }) });
    renderWithApi(<SettingsFaults backend={RUNNING} definition={definition} />, api);
    await userEvent.click(screen.getByLabelText('Rate limit'));
    await userEvent.clear(screen.getByLabelText('Requests'));
    await userEvent.type(screen.getByLabelText('Requests'), '5');
    await userEvent.type(screen.getByLabelText('Failure rate (%)'), '50');
    await userEvent.click(screen.getByLabelText('Send CORS headers'));
    await userEvent.clear(screen.getByLabelText('Allowed origins'));
    await userEvent.type(screen.getByLabelText('Allowed origins'), 'https://app.test');
    await userEvent.click(screen.getByLabelText('Allow credentials'));
    await userEvent.click(screen.getByRole('button', { name: 'Save faults and CORS' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(body(puts[0])).toEqual({ faults: { rateLimit: { requests: 5, perSeconds: 60, key: 'ip' }, failureRate: 0.5, failureStatus: 500 }, cors: { origins: ['https://app.test'], credentials: true, maxAge: 600 } });
    expect(await screen.findByLabelText('Fault counts')).toHaveTextContent('3 rate limited, 2 failed, 1 dropped');
  });

  it('AC-LP-10 refuses credentials with "*" origins and rates over 100 before calling the engine', async () => {
    const puts: HttpRequest[] = [];
    renderWithApi(<SettingsFaults backend={RUNNING} definition={definition} />, makeApi({ admin: adminRoutes({ 'GET /stats': () => ({}), 'PUT /settings/faults': (request) => (puts.push(request), {}) }) }));
    await userEvent.click(screen.getByLabelText('Send CORS headers'));
    await userEvent.click(screen.getByLabelText('Allow credentials'));
    await userEvent.click(screen.getByRole('button', { name: 'Save faults and CORS' }));
    expect(await screen.findByText('Credentials need a list of origins, not "*".')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Failure rate (%)'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save faults and CORS' }));
    expect(await screen.findByText('Rates are percentages from 0 to 100.')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('AC-LP-10 saves the session mode into the definition and explains the CSRF header', async () => {
    const puts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /stats': () => ({}), 'PUT /definition': (request) => (puts.push(request), {}) }) });
    renderWithApi(<SettingsFaults backend={RUNNING} definition={definition} />, api);
    await userEvent.selectOptions(screen.getByLabelText('Sign-in mode'), 'cookie');
    expect(screen.getByText(/x-tempo-csrf/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save session mode' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(body(puts[0])).toMatchObject({ name: 'shop', auth: { accessTtlMin: 30, mode: 'cookie' } });
  });
});

describe('Settings: OAuth mock', () => {
  const view = {
    enabled: true,
    provider: 'google',
    clients: [{ clientId: 'app-1', redirectUris: ['myapp://callback'], secretConfigured: false }],
    endpoints: { issuer: 'https://localhost:8556', authorizationEndpoint: 'https://localhost:8556/oauth/authorize', tokenEndpoint: 'https://localhost:8556/oauth/token', userinfoEndpoint: 'https://localhost:8556/oauth/userinfo', jwksUri: 'https://localhost:8556/oauth/jwks', discovery: 'https://localhost:8556/.well-known/openid-configuration' },
  };

  it('AC-LP-10 shows the addresses and a react-native-app-auth config, saves clients, and shows a new client secret once', async () => {
    const puts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /oauth': () => view, 'PUT /oauth': (request) => (puts.push(request), view), 'POST /oauth/clients/:clientId/secret': () => ({ clientId: 'app-1', secret: 'cs_shown_once_1' }) }) });
    renderWithApi(<SettingsOauth backend={RUNNING} />, api);
    expect(await screen.findByText('https://localhost:8556/oauth/token')).toBeInTheDocument();
    expect(screen.getByText(/usePKCE: true/)).toHaveTextContent("clientId: 'app-1'");
    await userEvent.click(screen.getByRole('button', { name: 'Add client' }));
    const ids = screen.getAllByLabelText('Client id');
    await userEvent.type(ids[1] as HTMLElement, 'app-2');
    await userEvent.type(screen.getAllByLabelText(/Redirect URIs/)[1] as HTMLElement, 'https://two.test/cb');
    await userEvent.selectOptions(screen.getByLabelText(/^Look like/), 'github');
    await userEvent.click(screen.getByRole('button', { name: 'Save OAuth settings' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(body(puts[0])).toEqual({ enabled: true, provider: 'github', clients: [{ clientId: 'app-1', redirectUris: ['myapp://callback'] }, { clientId: 'app-2', redirectUris: ['https://two.test/cb'] }] });
    await userEvent.click(screen.getByRole('button', { name: 'Make a client secret for app-1' }));
    expect(await screen.findByText('cs_shown_once_1')).toBeInTheDocument();
  });
});

describe('Inbox', () => {
  const entries = [
    { id: 2, endpointId: 'in', at: '2025-01-01T00:00:01Z', method: 'POST', path: '/inbox/stripe', size: 14, status: 200 },
    { id: 1, endpointId: 'in', at: '2025-01-01T00:00:00Z', method: 'GET', path: '/inbox/stripe', size: 0, status: 200 },
  ];
  const detail = { ...entries[0], query: 'n=1', headers: { 'content-type': 'application/json', authorization: '[REDACTED]', 'stripe-signature': '****abcd' }, body: '{"type":"paid"}', encoding: 'utf8', curl: "curl -X POST 'https://localhost:8556/inbox/stripe?n=1'" };

  it('AC-LP-8 lists captures without bodies, opens one with masked headers, a pretty JSON body and a curl command', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithApi(<Inbox backend="/work/shop" />, makeApi({ admin: adminRoutes({ 'GET /inbox': () => ({ entries, count: 2, bytes: 14 }), 'GET /inbox/:id': () => detail }) }));
    const table = await screen.findByRole('table', { name: 'Captured requests' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText(/paid/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Open POST /inbox/stripe #2' }));
    const panel = await screen.findByRole('region', { name: 'Captured request' });
    expect(within(panel).getByText('[REDACTED]')).toBeInTheDocument();
    expect(within(panel).getByText('****abcd')).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'Captured body' })).toHaveValue('{\n  "type": "paid"\n}');
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Raw' }));
    expect(within(panel).getByLabelText('Raw body')).toHaveTextContent('{"type":"paid"}');
    await userEvent.click(within(panel).getByRole('button', { name: /^Copy as curl/ }));
    expect(writeText).toHaveBeenCalledWith(detail.curl);
  });

  it('AC-LP-8 replays to a URL and reports the answer; the guard refusal is shown', async () => {
    const replays: HttpRequest[] = [];
    let refuse = false;
    const api = makeApi({
      admin: adminRoutes({
        'GET /inbox': () => ({ entries, count: 2, bytes: 14 }),
        'GET /inbox/:id': () => detail,
        'POST /inbox/:id/replay': (request) => (replays.push(request), refuse ? { status: 400, body: JSON.stringify({ detail: 'This server does not call addresses on a private network.' }), ms: 1, contentType: 'application/problem+json' } : { status: 202, body: '' }),
      }),
    });
    renderWithApi(<Inbox backend="/work/shop" />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Open POST /inbox/stripe #2' }));
    const form = await screen.findByRole('form', { name: 'Replay form' });
    await userEvent.type(within(form).getByLabelText('Send it to'), 'http://localhost:3000/hook');
    await userEvent.click(within(form).getByRole('button', { name: 'Replay' }));
    expect(await screen.findByText('The receiver answered 202.')).toBeInTheDocument();
    expect(body(replays[0])).toEqual({ url: 'http://localhost:3000/hook' });
    refuse = true;
    await userEvent.click(within(form).getByRole('button', { name: 'Replay' }));
    expect(await screen.findByText(/private network/)).toBeInTheDocument();
  });

  it('AC-LP-8 clears the inbox; a viewer sees the list only (no open, no clear)', async () => {
    const clears: string[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /inbox': () => ({ entries, count: 2, bytes: 14 }), 'DELETE /inbox': (request) => (clears.push(request.path), { deleted: 2 }) }) });
    const { unmount } = renderWithApi(<Inbox backend="/work/shop" />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Clear inbox' }));
    await waitFor(() => expect(clears).toEqual(['/inbox']));
    unmount();
    renderWithApi(
      <RoleProvider role="viewer">
        <Inbox backend="/work/shop" />
      </RoleProvider>,
      api,
    );
    await screen.findByRole('table', { name: 'Captured requests' });
    expect(screen.queryByRole('button', { name: 'Clear inbox' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();
  });

  it('AC-LP-8 prettyBody formats JSON, keeps other text, and leaves binary as base64', () => {
    expect(prettyBody({ body: '{"a":1}', encoding: 'utf8' })).toEqual({ text: '{\n  "a": 1\n}', json: true });
    expect(prettyBody({ body: 'plain', encoding: 'utf8' })).toEqual({ text: 'plain', json: false });
    expect(prettyBody({ body: '/+8=', encoding: 'base64' })).toEqual({ text: '/+8=', json: false });
  });
});
