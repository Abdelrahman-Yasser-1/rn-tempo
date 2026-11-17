import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Client } from '../client/client';
import { makeClient, PROJECT, renderWithClient } from '../test/fakeClient';

import { Logs } from './Logs';

describe('Logs', () => {
  it('reads the log through the CLI and shows it', async () => {
    const cli = vi.fn<Client['cli']>(() => Promise.resolve({ code: 0, stdout: '10:00:00 INFO  request GET /a 200 3ms\n', stderr: '' }));
    renderWithClient(<Logs project={PROJECT} />, makeClient({ cli }));
    expect(await screen.findByText(/request GET \/a 200/)).toBeInTheDocument();
    expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'logs', lines: 300 });
  });

  it('shows the notice when there is no log yet', async () => {
    const cli = vi.fn<Client['cli']>(() => Promise.resolve({ code: 1, stdout: '', stderr: 'tempo-api: No log yet.\n' }));
    renderWithClient(<Logs project={PROJECT} />, makeClient({ cli }));
    expect(await screen.findByText('No log yet.')).toBeInTheDocument();
  });

  it('filters lines and refreshes on demand', async () => {
    const cli = vi.fn<Client['cli']>(() => Promise.resolve({ code: 0, stdout: 'alpha one\nbeta two\n', stderr: '' }));
    renderWithClient(<Logs project={PROJECT} />, makeClient({ cli }));
    await screen.findByText(/alpha one/);
    await userEvent.type(screen.getByLabelText('Filter'), 'beta');
    expect(screen.queryByText(/alpha one/)).not.toBeInTheDocument();
    const calls = cli.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(cli.mock.calls.length).toBeGreaterThan(calls));
  });
});
