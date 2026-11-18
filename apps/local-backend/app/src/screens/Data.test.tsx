import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest } from '../client/types';
import { jsonReply, makeClient, PROJECT, renderWithClient, RUNNING } from '../test/fakeClient';

import { Data } from './Data';

const REPLY = {
  collections: [
    { name: 'products', total: 2, items: [{ id: 1, title: 'Phone', email: '[REDACTED]' }, { id: 2, title: 'Case', email: '[REDACTED]' }] },
    { name: 'users', total: 1, items: [{ id: 9, name: 'Ada' }] },
  ],
};

function fake(reply: unknown = REPLY) {
  const sent: HttpRequest[] = [];
  const control = vi.fn((_p: string, request: HttpRequest) => {
    sent.push(request);
    return Promise.resolve(jsonReply(request.method === 'POST' ? { ok: true } : reply));
  });
  return { sent, client: makeClient({ projectState: vi.fn(() => Promise.resolve(RUNNING)), control }) };
}

describe('Data', () => {
  it('shows the first collection read-only, with redacted values as the server sent them', async () => {
    renderWithClient(<Data project={PROJECT} />, fake().client);
    const table = await screen.findByRole('table', { name: 'Records' });
    expect(within(table).getByText('Phone')).toBeInTheDocument();
    expect(within(table).getAllByText('[REDACTED]')).toHaveLength(2);
    expect(screen.queryByRole('textbox', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('switches collection and filters rows', async () => {
    renderWithClient(<Data project={PROJECT} />, fake().client);
    await userEvent.selectOptions(await screen.findByLabelText('Collection'), 'users');
    expect(screen.getByText('Ada')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Collection'), 'products');
    await userEvent.type(screen.getByLabelText('Filter'), 'case');
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
    expect(screen.getByText('Case')).toBeInTheDocument();
  });

  it('resets only after the user confirms', async () => {
    const { sent, client } = fake();
    renderWithClient(<Data project={PROJECT} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Reset' }));
    expect(sent.some((request) => request.path === '/__tempo/reset')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, reset' }));
    await waitFor(() => expect(sent).toContainEqual(expect.objectContaining({ method: 'POST', path: '/__tempo/reset' })));
  });

  it('says so when the API has no stored records', async () => {
    renderWithClient(<Data project={PROJECT} />, fake({ collections: [] }).client);
    expect(await screen.findByText(/no stored records/)).toBeInTheDocument();
  });

  it('asks to start the server when it is stopped', async () => {
    renderWithClient(<Data project={PROJECT} />, makeClient());
    expect(await screen.findByText(/Start the server/)).toBeInTheDocument();
  });
});
