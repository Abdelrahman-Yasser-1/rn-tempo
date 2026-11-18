import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ServerInfo } from '../client/types';
import { jsonReply, makeClient, OK_OUTPUT, PROJECT, renderWithClient, RUNNING, STOPPED } from '../test/fakeClient';

import { Overview } from './Overview';

const INFO: ServerInfo = {
  service: 'tempo-dev-api',
  version: '1.0.0',
  project: 'demo',
  scheme: 'https',
  port: 8555,
  urls: { local: 'https://localhost:8555', lan: 'https://192.168.1.20:8555', androidEmulator: 'https://10.0.2.2:8555', iosSimulator: 'https://localhost:8555' },
  cert: { present: true },
  startedAt: '2026-01-01T00:00:00.000Z',
};

describe('Overview', () => {
  it('starts the server on the chosen port over HTTPS', async () => {
    const cli = vi.fn(() => Promise.resolve(OK_OUTPUT));
    renderWithClient(<Overview project={PROJECT} />, makeClient({ cli }));
    await userEvent.type(await screen.findByLabelText('Port'), '8555');
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'up', port: 8555, http: false }));
    expect(await screen.findByText('done')).toBeInTheDocument();
  });

  it('starts with plain HTTP when asked', async () => {
    const cli = vi.fn(() => Promise.resolve(OK_OUTPUT));
    renderWithClient(<Overview project={PROJECT} />, makeClient({ cli }));
    await userEvent.click(await screen.findByLabelText('HTTP'));
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'up', port: null, http: true }));
  });

  it('will not start with a port that is not a number', async () => {
    renderWithClient(<Overview project={PROJECT} />, makeClient({ projectState: vi.fn(() => Promise.resolve(STOPPED)) }));
    await userEvent.type(await screen.findByLabelText('Port'), 'abc');
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('shows the addresses of a running server and a LAN QR code', async () => {
    const control = vi.fn(() => Promise.resolve(jsonReply(INFO)));
    renderWithClient(<Overview project={PROJECT} />, makeClient({ projectState: vi.fn(() => Promise.resolve(RUNNING)), control }));
    expect(await screen.findByText('https://192.168.1.20:8555')).toBeInTheDocument();
    expect(screen.getByText('https://10.0.2.2:8555')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR code for https://192.168.1.20:8555' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(control).toHaveBeenCalledWith('/work/demo', { method: 'GET', path: '/__tempo/info' });
  });

  it('stops a running server', async () => {
    const cli = vi.fn(() => Promise.resolve(OK_OUTPUT));
    const control = vi.fn(() => Promise.resolve(jsonReply(INFO)));
    renderWithClient(<Overview project={PROJECT} />, makeClient({ projectState: vi.fn(() => Promise.resolve(RUNNING)), control, cli }));
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'down' }));
  });

  it('shows a start failure from Rust as an alert', async () => {
    const cli = vi.fn(() => Promise.reject(new Error('Node.js was not found.')));
    renderWithClient(<Overview project={PROJECT} />, makeClient({ cli }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Node.js was not found.');
  });
});
