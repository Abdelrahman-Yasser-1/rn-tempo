import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { makeApi, renderWithApi, RUNNING, STOPPED } from '../test/fakeApi';

import { App } from './App';

describe('App', () => {
  it('explains the empty list and lists backends with a status dot', async () => {
    renderWithApi(<App />, makeApi());
    expect(await screen.findByText(/No backends yet/)).toBeInTheDocument();
  });

  it('lists backends with a status dot', async () => {
    renderWithApi(<App />, makeApi({ listBackends: () => Promise.resolve([RUNNING, { ...STOPPED, path: '/work/b', name: 'blog', state: 'error' }]) }));
    const sidebar = await screen.findByRole('navigation', { name: 'Backends' });
    expect(await within(sidebar).findByRole('img', { name: 'running' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('img', { name: 'error' })).toBeInTheDocument();
  });

  it('shows the nine tabs of a selected backend and moves between them with the arrow keys', async () => {
    renderWithApi(<App />, makeApi({ listBackends: () => Promise.resolve([STOPPED]) }));
    await userEvent.click(await screen.findByRole('button', { name: /^stopped\s*shop$/ }));
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Dashboard', 'Endpoints', 'Data', 'Media', 'Users', 'Content', 'Logs', 'Inbox', 'Settings']);
    screen.getByRole('tab', { name: 'Dashboard' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Endpoints' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Endpoints' })).toHaveFocus();
  });

  it('New backend is two steps: the folder, then the starting point', async () => {
    const created = { ...STOPPED, path: '/work/new', name: 'new' };
    const api = makeApi({
      pickNewFolder: () => Promise.resolve({ path: '/work/new', empty: true, hasBackend: false }),
      createBackend: () => Promise.resolve(created),
    });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'New backend' }));
    const dialog = screen.getByRole('dialog', { name: 'New backend' });
    expect(within(dialog).getByRole('button', { name: 'Create backend' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose folder…' }));
    expect(await within(dialog).findByText('/work/new')).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: /Tempo template/ })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('radio', { name: /Empty/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create backend' }));
    await waitFor(() => {
      expect(api.createBackend).toHaveBeenCalledWith('/work/new', 'new', 'empty', null);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('refuses a folder that is not empty', async () => {
    const api = makeApi({ pickNewFolder: () => Promise.resolve({ path: '/work/full', empty: false, hasBackend: false }) });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'New backend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose folder…' }));
    expect(await screen.findByText(/not empty/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create backend' })).toBeDisabled();
  });

  it('removing a backend asks first and says the folder stays', async () => {
    const api = makeApi({ listBackends: () => Promise.resolve([STOPPED]) });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Remove shop from the list' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('stay on your disk');
    expect(api.removeBackend).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove from list' }));
    await waitFor(() => {
      expect(api.removeBackend).toHaveBeenCalledWith('/work/shop');
    });
  });

  it('Open backend adds the chosen folder', async () => {
    const api = makeApi({ openBackend: () => Promise.resolve(STOPPED) });
    renderWithApi(<App />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Open backend…' }));
    await waitFor(() => {
      expect(api.openBackend).toHaveBeenCalled();
    });
  });
});
