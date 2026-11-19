import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WEB_CAPABILITIES, type WebSession } from '../api/client';
import { Media } from '../tabs/Media';
import { Settings } from '../tabs/Settings';
import { adminRoutes, makeApi, renderWithApi, RUNNING, STOPPED } from '../test/fakeApi';

import { App } from './App';
import { WebGate } from './WebGate';

const webApi = (overrides: Parameters<typeof makeApi>[0] = {}) => makeApi({ capabilities: WEB_CAPABILITIES, ...overrides });

describe('web mode rendering (AC-LP-1)', () => {
  it('hides the desktop-only trust actions and the folder button, and says why', async () => {
    const api = webApi({
      admin: adminRoutes({ 'GET /definition': () => ({ name: 'shop', port: 8556, https: true, endpoints: [], collections: [] }) }),
    });
    renderWithApi(<Settings backend={RUNNING} onOpen={vi.fn()} />, api);
    const certificates = await screen.findByRole('region', { name: 'Certificates' });
    expect(within(certificates).getByRole('button', { name: /certificate/i })).toBeInTheDocument();
    expect(within(certificates).queryByRole('button', { name: /Trust on this Mac/ })).toBeNull();
    expect(within(certificates).queryByRole('button', { name: /Android/ })).toBeNull();
    expect(within(certificates).queryByText('iOS simulator')).toBeNull();
    expect(within(certificates).getByText(/changes a trust store, so it is not done from the browser/)).toBeInTheDocument();
    expect(api.listSimulators).not.toHaveBeenCalled();
    const folder = screen.getByRole('region', { name: 'Folder' });
    expect(within(folder).queryByRole('button', { name: 'Open folder' })).toBeNull();
    expect(within(folder).getByText(/backends directory of the machine that runs the server/)).toBeInTheDocument();
  });

  it('keeps the desktop actions in the desktop shell', async () => {
    const api = makeApi({ admin: adminRoutes({ 'GET /definition': () => ({ name: 'shop', port: 8556, https: true, endpoints: [], collections: [] }) }) });
    renderWithApi(<Settings backend={RUNNING} onOpen={vi.fn()} />, api);
    expect(await screen.findByRole('button', { name: /Trust on this Mac/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeInTheDocument();
  });

  it('tells the browser user to pick files instead of dropping them', async () => {
    renderWithApi(<Media backend={RUNNING} />, webApi({ admin: adminRoutes({ 'GET /media': () => ({ items: [], total: 0, skip: 0, limit: 60 }), 'GET /media/usage': () => ({ files: 0, bytes: 0, maxBytes: 1 }) }) }));
    expect(await screen.findByText(/Choose Upload files/)).toBeInTheDocument();
    expect(screen.queryByText(/Drop files anywhere/)).toBeNull();
  });

  it('creates a backend by name inside the backends directory, with no folder dialog', async () => {
    const created = { ...STOPPED, path: 'my-shop', name: 'My Shop' };
    const api = webApi({ createBackend: () => Promise.resolve(created) });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'New backend' }));
    const dialog = screen.getByRole('dialog', { name: 'New backend' });
    expect(within(dialog).queryByRole('button', { name: /Choose folder/ })).toBeNull();
    expect(within(dialog).getByText(/backends directory/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'My Shop');
    expect(within(dialog).getByText('my-shop')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Empty/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backend' }));
    await waitFor(() => {
      expect(api.createBackend).toHaveBeenCalledWith('my-shop', 'My Shop', 'empty', null);
    });
    expect(api.pickNewFolder).not.toHaveBeenCalled();
  });

  it('opens a folder of the backends directory from a list, not from a folder dialog', async () => {
    const opened = { ...STOPPED, path: 'old', name: 'old' };
    const api = webApi({ listUnlisted: () => Promise.resolve(['old']), openNamed: () => Promise.resolve(opened) });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Open backend…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Open old' }));
    await waitFor(() => {
      expect(api.openNamed).toHaveBeenCalledWith('old');
    });
    expect(api.openBackend).not.toHaveBeenCalled();
  });
});

function session(overrides: Partial<WebSession> = {}): WebSession & { expire: () => void } {
  let expired: () => void = () => undefined;
  return {
    check: () => Promise.resolve(false),
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    onExpired: (handler) => {
      expired = handler;
      return () => undefined;
    },
    expire: () => {
      expired();
    },
    ...overrides,
  };
}

describe('the sign-in (AC-LP-1)', () => {
  it('shows the dashboard at once in the desktop shell', () => {
    render(
      <WebGate session={null}>
        <p>dashboard</p>
      </WebGate>,
    );
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('asks for the code, sends it in the body, and shows the dashboard after it is accepted', async () => {
    const login = vi.fn(() => Promise.resolve());
    render(
      <WebGate session={session({ login })}>
        <p>dashboard</p>
      </WebGate>,
    );
    await userEvent.type(await screen.findByLabelText('Login code'), 'ABCDE-FGHJK');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('ABCDE-FGHJK');
    expect(window.location.href).not.toContain('ABCDE');
  });

  it('shows the server message for a wrong or used code', async () => {
    render(
      <WebGate session={session({ login: () => Promise.reject(new Error('That code is wrong, used or expired.')) })}>
        <p>dashboard</p>
      </WebGate>,
    );
    await userEvent.type(await screen.findByLabelText('Login code'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That code is wrong, used or expired.')).toBeInTheDocument();
    expect(screen.queryByText('dashboard')).toBeNull();
  });

  it('goes straight in when the browser already has a session, and comes back to the sign-in when it ends', async () => {
    const live = session({ check: () => Promise.resolve(true) });
    render(
      <WebGate session={live}>
        <p>dashboard</p>
      </WebGate>,
    );
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    live.expire();
    expect(await screen.findByText(/Your session ended/)).toBeInTheDocument();
    expect(screen.queryByText('dashboard')).toBeNull();
  });
});
