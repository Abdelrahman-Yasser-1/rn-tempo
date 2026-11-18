import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest } from '../api/types';
import { adminRoutes, makeApi, renderWithApi, RUNNING, STOPPED } from '../test/fakeApi';

import { Settings } from './Settings';

const definition = { name: 'shop', port: 8556, https: true, auth: { accessTtlMin: 30, refreshTtlDays: 30, seedUsers: [{ username: 'emilys', password: 'x' }] }, media: { maxBytes: 104_857_600 }, endpoints: [], collections: [] };

function setup(backend = RUNNING) {
  const puts: HttpRequest[] = [];
  const api = makeApi({
    admin: adminRoutes({ 'GET /definition': () => definition, 'PUT /definition': (request) => (puts.push(request), { ok: true }) }),
    listSimulators: () => Promise.resolve([{ udid: 'AB12-34', name: 'iPhone 16', runtime: 'iOS 18.0' }]),
  });
  const onOpen = vi.fn();
  renderWithApi(<Settings backend={backend} onOpen={onOpen} />, api);
  return { api, puts, onOpen };
}

describe('Settings', () => {
  it('saves the port, HTTPS and token lifetimes through the engine, keeping the rest of the definition', async () => {
    const { puts } = setup();
    const server = await screen.findByRole('region', { name: 'Server' });
    const port = within(server).getByLabelText('Port');
    expect(port).toHaveValue('8556');
    await userEvent.clear(port);
    await userEvent.type(port, '8560');
    await userEvent.clear(within(server).getByLabelText('Access token lifetime (minutes)'));
    await userEvent.type(within(server).getByLabelText('Access token lifetime (minutes)'), '45');
    await userEvent.click(within(server).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => {
      expect(puts).toHaveLength(1);
    });
    expect(JSON.parse(puts[0]?.body ?? '{}')).toMatchObject({ port: 8560, https: true, auth: { accessTtlMin: 45, refreshTtlDays: 30, seedUsers: [{ username: 'emilys' }] }, media: { maxBytes: 104_857_600 } });
    // A new port needs a restart, and the app offers it.
    expect(await within(server).findByText(/Restart the backend to use it/)).toBeInTheDocument();
  });

  it('a value that is not a number cannot be saved', async () => {
    setup();
    const server = await screen.findByRole('region', { name: 'Server' });
    await userEvent.clear(within(server).getByLabelText('Port'));
    await userEvent.type(within(server).getByLabelText('Port'), 'abc');
    expect(within(server).getByRole('button', { name: 'Save settings' })).toBeDisabled();
  });

  it('creates the certificate and reports the engine answer', async () => {
    const { api } = setup();
    vi.mocked(api.engineCli).mockResolvedValue({ code: 0, stdout: '', stderr: 'Certificate written to /work/shop/.data/certs.\n' });
    await userEvent.click(await screen.findByRole('button', { name: 'Create a new certificate' }));
    expect(api.engineCli).toHaveBeenCalledWith('/work/shop', { kind: 'certs' });
    expect(await screen.findByText('Certificate written to /work/shop/.data/certs.')).toBeInTheDocument();
  });

  it('trusting on this Mac needs an explicit confirm that names what changes', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Trust on this Mac…' }));
    const dialog = screen.getByRole('dialog', { name: 'Trust the certificate on this Mac?' });
    expect(dialog).toHaveTextContent('trust stores');
    expect(dialog).toHaveTextContent('password');
    expect(api.engineCli).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.engineCli).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Trust on this Mac…' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trust on this Mac' }));
    await waitFor(() => {
      expect(api.engineCli).toHaveBeenCalledWith('/work/shop', { kind: 'trustMac' });
    });
  });

  it('trusts a booted iOS simulator and sends the CA to Android', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Trust on iPhone 16' }));
    expect(api.engineCli).toHaveBeenCalledWith('/work/shop', { kind: 'trustIos', device: 'AB12-34' });
    await userEvent.click(screen.getByRole('button', { name: 'Send to Android emulator' }));
    await waitFor(() => {
      expect(api.engineCli).toHaveBeenLastCalledWith('/work/shop', { kind: 'pushAndroid', serial: null });
    });
  });

  it('shows the phone QR code for the public CA', async () => {
    setup();
    expect(await screen.findByRole('img', { name: 'QR code for https://192.168.1.20:8556/__ca.pem' })).toBeInTheDocument();
  });

  it('a stopped backend can still make certificates, but its port settings wait for Start', async () => {
    setup(STOPPED);
    expect(await screen.findByText(/Start the backend on the Dashboard tab/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Server' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Create a new certificate' })).toBeEnabled();
  });

  it('exports a backup and restores into a new folder, opening it', async () => {
    const { api, onOpen } = setup();
    vi.mocked(api.exportSnapshot).mockResolvedValue('/Users/me/shop.zip');
    vi.mocked(api.restoreSnapshot).mockResolvedValue({ ...STOPPED, path: '/work/restored', name: 'restored' });
    await userEvent.click(await screen.findByRole('button', { name: 'Export backup…' }));
    expect(await screen.findByText(/Backup saved to \/Users\/me\/shop.zip/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restore into new folder…' }));
    await waitFor(() => {
      expect(onOpen).toHaveBeenCalledWith('/work/restored');
    });
  });

  it('lists what differs from an OpenAPI file, and says plainly when nothing does', async () => {
    const { api } = setup();
    const report = {
      ok: false,
      missing: [{ method: 'GET', path: '/app-config' }],
      extra: [],
      methodMismatches: [{ method: 'PUT', path: '/users/{id}', backendMethods: ['PATCH'] }],
      differences: [{ method: 'GET', path: '/products', status: '200', property: 'products[].price', kind: 'type', expected: 'number', actual: 'string', message: 'products[].price is a string here, the file says number.' }],
      unchecked: [],
      counts: { fileEndpoints: 3, backendEndpoints: 2, matched: 1 },
    };
    vi.mocked(api.checkOpenapi).mockResolvedValueOnce({ code: 1, stdout: JSON.stringify(report), stderr: '' });
    await userEvent.click(await screen.findByRole('button', { name: 'Check against OpenAPI file…' }));
    const result = await screen.findByLabelText('Check result');
    expect(within(result).getByRole('alert')).toHaveTextContent('3 differences');
    expect(result).toHaveTextContent('GET /app-config');
    expect(result).toHaveTextContent('exists here as PATCH');
    expect(result).toHaveTextContent('products[].price is a string here');
    vi.mocked(api.checkOpenapi).mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ ...report, ok: true, missing: [], methodMismatches: [], differences: [] }), stderr: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Check against OpenAPI file…' }));
    expect(await screen.findByText(/No differences/)).toBeInTheDocument();
  });

  it('shows the engine message when the file cannot be checked', async () => {
    const { api } = setup();
    vi.mocked(api.checkOpenapi).mockResolvedValue({ code: 1, stdout: '', stderr: 'local-backend-engine: The OpenAPI file is not valid JSON.\n' });
    await userEvent.click(await screen.findByRole('button', { name: 'Check against OpenAPI file…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The OpenAPI file is not valid JSON.');
  });

  it('Open folder goes through Rust', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Open folder' }));
    expect(api.reveal).toHaveBeenCalledWith('/work/shop', 'folder');
  });
});
