import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { HttpRequest } from '../api/types';
import { adminRoutes, makeApi, renderWithApi } from '../test/fakeApi';

import { Users } from './Users';

const emilys = { id: 1, username: 'emilys', email: 'e@x.test', firstName: 'Emily', lastName: 'Johnson', disabled: false, hasPassword: true, createdAt: '2026-11-18T08:00:00Z' };
const dana = { ...emilys, id: 2, username: 'dana', firstName: 'Dana', lastName: '', disabled: true };

function setup() {
  const seen: HttpRequest[] = [];
  const log = (answer: unknown) => (request: HttpRequest) => (seen.push(request), answer);
  const api = makeApi({
    admin: adminRoutes({
      'GET /users': () => ({ users: [emilys, dana], total: 2, skip: 0, limit: 100 }),
      'GET /sessions': () => ({ sessions: [{ id: 7, userId: 1, username: 'emilys', family: 'f', createdAt: '2026-11-18T08:10:00.000Z', expiresAt: '2026-12-18T08:10:00.000Z' }] }),
      'POST /users': log({ id: 3 }),
      'POST /users/:id/password': log({ ok: true, revoked: 1 }),
      'POST /users/:id/revoke': log({ ok: true, revoked: 2 }),
      'POST /users/:id/disable': log({ ok: true }),
      'POST /users/:id/enable': log({ ok: true }),
      'DELETE /users/:id': log({ ok: true }),
      'DELETE /sessions/:id': log({ ok: true }),
    }),
  });
  renderWithApi(<Users backend="/work/shop" />, api);
  return { seen };
}

describe('Users', () => {
  it('lists users with their status and who is signed in', async () => {
    setup();
    expect(await screen.findByRole('cell', { name: 'emilys' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Disabled' })).toBeInTheDocument();
    const sessions = screen.getByRole('region', { name: 'Sessions' });
    expect(await within(sessions).findByText(/since 2026-11-18 08:10:00/)).toBeInTheDocument();
  });

  it('adds a user and leaves empty optional fields out', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a user' });
    expect(within(dialog).getByRole('button', { name: 'Add user' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Username'), 'sam');
    await userEvent.type(within(dialog).getByLabelText('Password'), 'sampass12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ username: 'sam', password: 'sampass12' });
  });

  it('resets a password', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Reset password of emilys' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('New password'), 'newpass12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText(/password was reset/)).toBeInTheDocument();
    expect(seen[0]?.path).toBe('/users/1/password');
  });

  it('Sign out everywhere asks first, then revokes every session', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out emilys everywhere' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign out everywhere?' });
    expect(dialog).toHaveTextContent('stop working right away');
    expect(seen).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign out everywhere' }));
    expect(await screen.findByText(/signed out of 2 sessions/)).toBeInTheDocument();
    expect(seen[0]?.path).toBe('/users/1/revoke');
  });

  it('disabling asks first; enabling does not need to', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Enable dana' }));
    await waitFor(() => {
      expect(seen[0]?.path).toBe('/users/2/enable');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Disable emilys' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable user' }));
    await waitFor(() => {
      expect(seen[1]?.path).toBe('/users/1/disable');
    });
  });

  it('deleting names the user and asks first', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete dana' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this user?' });
    expect(dialog).toHaveTextContent('dana');
    expect(seen).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    await waitFor(() => {
      expect(seen[0]?.path).toBe('/users/2');
    });
  });

  it('ends one session', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'End the session of emilys (7)' }));
    await waitFor(() => {
      expect(seen[0]?.path).toBe('/sessions/7');
    });
  });
});
