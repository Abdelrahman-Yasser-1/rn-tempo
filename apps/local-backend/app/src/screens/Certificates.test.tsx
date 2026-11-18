import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Client } from '../client/client';
import type { ServerInfo } from '../client/types';
import { jsonReply, makeClient, OK_OUTPUT, PROJECT, renderWithClient, RUNNING } from '../test/fakeClient';

import { Certificates } from './Certificates';

const SIM = { udid: 'AAAA-1111', name: 'iPhone 16', runtime: 'iOS 18.0' };
const INFO: ServerInfo = {
  service: 'tempo-dev-api',
  version: '1',
  project: 'p',
  scheme: 'https',
  port: 8555,
  urls: { local: 'https://localhost:8555', lan: 'https://192.168.1.5:8555', androidEmulator: 'https://10.0.2.2:8555', iosSimulator: 'https://localhost:8555' },
  cert: { present: true, notAfter: '2030-01-01T00:00:00Z', coversLanIp: true },
  startedAt: '2026-01-01T00:00:00Z',
};

function setup(overrides: Parameters<typeof makeClient>[0] = {}) {
  const cli = vi.fn<Client['cli']>(() => Promise.resolve(OK_OUTPUT));
  const client = makeClient({
    certStatus: vi.fn(() => Promise.resolve({ hasCert: true, hasCa: true })),
    listBootedSimulators: vi.fn(() => Promise.resolve([SIM])),
    cli,
    ...overrides,
  });
  return { cli, client };
}

describe('Certificates', () => {
  it('creates the certificate without touching the trust store', async () => {
    const { cli, client } = setup({ certStatus: vi.fn(() => Promise.resolve({ hasCert: false, hasCa: false })) });
    renderWithClient(<Certificates project={PROJECT} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Create certificate' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'certs', install: false }));
  });

  it('never trusts on the Mac until the user confirms the password prompt', async () => {
    const { cli, client } = setup();
    renderWithClient(<Certificates project={PROJECT} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Trust on this Mac…' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('asks for your Mac password');
    expect(cli).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cli).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Trust on this Mac…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ask for my password and trust it' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'certs', install: true }));
  });

  it('lists booted simulators and trusts on the chosen one', async () => {
    const { cli, client } = setup();
    renderWithClient(<Certificates project={PROJECT} />, client);
    const button = await screen.findByRole('button', { name: 'Trust on iPhone 16' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'trustIos', device: 'AAAA-1111' }));
  });

  it('says when no simulator is booted', async () => {
    const { client } = setup({ listBootedSimulators: vi.fn(() => Promise.resolve([])) });
    renderWithClient(<Certificates project={PROJECT} />, client);
    expect(await screen.findByText(/No simulator is booted/)).toBeInTheDocument();
  });

  it('pushes the CA to the Android emulator and shows the install steps', async () => {
    const { cli, client } = setup();
    renderWithClient(<Certificates project={PROJECT} />, client);
    await screen.findByText(/Install a certificate/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Push to Android emulator' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Push to Android emulator' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'trustAndroid', push: true }));
  });

  it('shows a QR code for the CA download and the certificate status when the server runs', async () => {
    const { client } = setup({ projectState: vi.fn(() => Promise.resolve(RUNNING)), control: vi.fn(() => Promise.resolve(jsonReply(INFO))) });
    renderWithClient(<Certificates project={PROJECT} />, client);
    expect(await screen.findByRole('img', { name: 'QR code for https://192.168.1.5:8555/__tempo/ca.pem' })).toBeInTheDocument();
    expect(await screen.findByText(/covers your LAN address/)).toBeInTheDocument();
  });

  it('shows a command failure as an alert', async () => {
    const { client } = setup({ cli: vi.fn(() => Promise.reject(new Error('mkcert is not installed.'))) });
    renderWithClient(<Certificates project={PROJECT} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Recreate certificate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('mkcert is not installed.');
  });
});
