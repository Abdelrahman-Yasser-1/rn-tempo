import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WEB_CAPABILITIES, type WebSession } from '../api/client';
import type { Me, Member, MemberRole, TeamApi } from '../api/team';
import { adminRoutes, makeApi, renderWithApi, RUNNING } from '../test/fakeApi';

import { BackendView } from './BackendView';
import { Profile } from './Profile';
import { Sidebar } from './Sidebar';
import { WebGate } from './WebGate';

const SHOP = { ...RUNNING, path: 'shop', name: 'Shop' };

const account = (over: Partial<Me['account']> = {}): Me['account'] => ({ id: 1, email: 'me@example.com', name: 'Me', owner: false, disabled: false, totp: false, recoveryCodesLeft: 0, invitePending: false, createdAt: '2026-01-01T00:00:00Z', lastLoginAt: null, ...over });
const member = (id: number, role: MemberRole, over: Partial<Member> = {}): Member => ({ ...account({ id, email: `p${String(id)}@example.com`, name: `Person ${String(id)}` }), role, ...over });

function makeTeam(over: Partial<TeamApi> = {}, me: Me = { account: account(), memberships: [{ backendId: 'shop', role: 'viewer' }] }): TeamApi {
  return {
    me: vi.fn(() => Promise.resolve(me)),
    changePassword: vi.fn(() => Promise.resolve()),
    totpSetup: vi.fn(() => Promise.resolve({ secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Tempo:me@example.com?secret=JBSWY3DPEHPK3PXP' })),
    totpEnable: vi.fn(() => Promise.resolve(Array.from({ length: 10 }, (_v, i) => `code${String(i)}-aaaaa`))),
    totpDisable: vi.fn(() => Promise.resolve()),
    newRecoveryCodes: vi.fn(() => Promise.resolve([])),
    members: vi.fn(() => Promise.resolve([member(2, 'editor'), member(3, 'admin')])),
    invite: vi.fn(() => Promise.resolve({ member: member(9, 'viewer'), setup: { token: 'T'.repeat(43), expiresAt: '2026-11-20T10:00:00Z' } })),
    setRole: vi.fn(() => Promise.resolve()),
    removeMember: vi.fn(() => Promise.resolve()),
    resetTotp: vi.fn(() => Promise.resolve()),
    resetLink: vi.fn(() => Promise.resolve({ token: 'R'.repeat(43), expiresAt: '2026-11-20T10:00:00Z' })),
    accounts: vi.fn(() => Promise.resolve([])),
    setDisabled: vi.fn(() => Promise.resolve()),
    apiKeys: vi.fn(() => Promise.resolve([])),
    createApiKey: vi.fn(() => Promise.resolve({ key: `tlb_${'K'.repeat(43)}`, record: { id: 1, name: 'CI', scope: 'read-definition' as const, prefix: 'tlb_KKKKKKKK', createdBy: 'me', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, revokedAt: null } })),
    revokeApiKey: vi.fn(() => Promise.resolve()),
    audit: vi.fn(() => Promise.resolve({ entries: [], total: 0 })),
    ...over,
  };
}

const teamApi = (team: TeamApi, extra: Parameters<typeof makeApi>[0] = {}) =>
  makeApi({
    capabilities: WEB_CAPABILITIES,
    team,
    admin: adminRoutes({
      'GET /definition': () => ({ name: 'shop', port: 8556, https: false, endpoints: [{ id: 'get.products', type: 'static', method: 'GET', path: '/products', status: 200 }], collections: [] }),
      'GET /scenarios': () => ({ active: {}, endpoints: [] }),
      'GET /stats': () => ({ requestsPerMinute: 0, errorRate: 0, endpoints: [], collections: {} }),
      'GET /media/usage': () => ({ files: 0, bytes: 0, maxBytes: 1 }),
    }),
    ...extra,
  });

const tabNames = (): string[] => screen.getAllByRole('tab').map((tab) => tab.textContent);

afterEach(() => {
  window.location.hash = '';
});

describe('team server: role based hiding (AC-LP-2)', () => {
  it('AC-LP-2 shows a viewer no Settings or Team tab and no buttons that change anything', async () => {
    const api = teamApi(makeTeam());
    renderWithApi(<BackendView backend={SHOP} onOpen={vi.fn()} />, api);
    await waitFor(() => {
      expect(tabNames()).toEqual(['Dashboard', 'Endpoints', 'Data', 'Media', 'Users', 'Content', 'Logs']);
    });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Endpoints' }));
    expect(await screen.findByText('/products')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add endpoint' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Try/ })).toBeInTheDocument();
  });

  it('AC-LP-2 shows an editor the editing buttons but not Settings, Team or Stop', async () => {
    const api = teamApi(makeTeam({}, { account: account(), memberships: [{ backendId: 'shop', role: 'editor' }] }));
    renderWithApi(<BackendView backend={SHOP} onOpen={vi.fn()} />, api);
    await waitFor(() => {
      expect(tabNames()).not.toContain('Settings');
    });
    expect(tabNames()).not.toContain('Team');
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Endpoints' }));
    expect(await screen.findByRole('button', { name: 'Add endpoint' })).toBeInTheDocument();
  });

  it('AC-LP-2 gives an admin the Settings and Team tabs and the Stop button, and the role of another backend does not count', async () => {
    const api = teamApi(makeTeam({}, { account: account(), memberships: [{ backendId: 'shop', role: 'admin' }, { backendId: 'other', role: 'viewer' }] }));
    renderWithApi(<BackendView backend={SHOP} onOpen={vi.fn()} />, api);
    await waitFor(() => {
      expect(tabNames()).toContain('Team');
    });
    expect(tabNames()).toContain('Settings');
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('AC-LP-2 leaves everything visible outside a team server (the desktop and the local web)', async () => {
    renderWithApi(<BackendView backend={SHOP} onOpen={vi.fn()} />, makeApi({ admin: teamApi(makeTeam()).admin }));
    expect(tabNames()).toEqual(['Dashboard', 'Endpoints', 'Data', 'Media', 'Users', 'Content', 'Logs', 'Settings']);
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('AC-LP-2 offers New backend to the owner only', async () => {
    const api = (owner: boolean) => teamApi(makeTeam({}, { account: account({ owner }), memberships: [] }), { listBackends: () => Promise.resolve([SHOP]) });
    const first = renderWithApi(<Sidebar selected={null} onSelect={vi.fn()} />, api(false));
    expect(await screen.findByText('Shop')).toBeInTheDocument();
    await screen.findByRole('button', { name: /^Account/ });
    expect(screen.queryByRole('button', { name: 'New backend' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove Shop/ })).toBeNull();
    first.unmount();
    renderWithApi(<Sidebar selected={null} onSelect={vi.fn()} />, api(true));
    expect(await screen.findByRole('button', { name: 'New backend' })).toBeInTheDocument();
  });
});

describe('team server: the Team area (AC-LP-2)', () => {
  const adminApi = (team: TeamApi) => teamApi(team);
  const renderTeam = async (team: TeamApi) => {
    renderWithApi(<BackendView backend={SHOP} onOpen={vi.fn()} />, adminApi(team));
    await userEvent.click(await screen.findByRole('tab', { name: 'Team' }));
  };
  const adminMe: Me = { account: account(), memberships: [{ backendId: 'shop', role: 'admin' }] };

  it('AC-LP-2 invites someone and shows the one-time setup link once, with the token after a #', async () => {
    const team = makeTeam({}, adminMe);
    await renderTeam(team);
    const form = await screen.findByRole('form', { name: 'Invite' });
    await userEvent.type(within(form).getByLabelText('Email'), 'new@example.com');
    await userEvent.type(within(form).getByLabelText('Name'), 'Nia');
    await userEvent.click(within(form).getByRole('button', { name: 'Invite' }));
    await waitFor(() => {
      expect(team.invite).toHaveBeenCalledWith('shop', { email: 'new@example.com', name: 'Nia', role: 'viewer' });
    });
    const link = await screen.findByRole('region', { name: 'Setup link for p9@example.com' });
    expect(within(link).getByText(`${window.location.origin}/#setup=${'T'.repeat(43)}`)).toBeInTheDocument();
    expect(within(link).getByText(/shown only now/)).toBeInTheDocument();
    await userEvent.click(within(link).getByRole('button', { name: 'I copied it' }));
    expect(screen.queryByText(/#setup=/)).toBeNull();
  });

  it('AC-LP-2 sets a role, removes a member after asking, and resets two-step sign-in', async () => {
    const team = makeTeam({ members: vi.fn(() => Promise.resolve([member(2, 'editor', { totp: true }), member(3, 'admin')])) }, adminMe);
    await renderTeam(team);
    const select = await screen.findByLabelText('Role of p2@example.com');
    await userEvent.selectOptions(select, 'viewer');
    await waitFor(() => {
      expect(team.setRole).toHaveBeenCalledWith('shop', 2, 'viewer');
    });
    // An admin cannot touch another admin.
    expect(screen.getByLabelText('Role of p3@example.com')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove p3@example.com' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reset two-step sign-in of p2@example.com' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Reset two-step sign-in?' })).getByRole('button', { name: 'Reset' }));
    await waitFor(() => {
      expect(team.resetTotp).toHaveBeenCalledWith('shop', 2);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Remove p2@example.com' }));
    expect(team.removeMember).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove this member?' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(team.removeMember).toHaveBeenCalledWith('shop', 2);
    });
  });

  it('AC-LP-2 creates an API key and shows it once, then lists only its prefix, and revokes it after asking', async () => {
    const listed = [{ id: 1, name: 'CI', scope: 'read-definition' as const, prefix: 'tlb_KKKKKKKK', createdBy: 'me', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null, revokedAt: null }];
    const team = makeTeam({ apiKeys: vi.fn(() => Promise.resolve(listed)) }, adminMe);
    await renderTeam(team);
    const form = await screen.findByRole('form', { name: 'New API key' });
    await userEvent.type(within(form).getByLabelText('Key name'), 'CI');
    await userEvent.click(within(form).getByRole('button', { name: 'Create key' }));
    await waitFor(() => {
      expect(team.createApiKey).toHaveBeenCalledWith('shop', { name: 'CI', scope: 'read-definition' });
    });
    const shown = await screen.findByRole('region', { name: 'New API key' });
    expect(within(shown).getByText(`tlb_${'K'.repeat(43)}`)).toBeInTheDocument();
    await userEvent.click(within(shown).getByRole('button', { name: 'I copied it' }));
    expect(screen.queryByText(`tlb_${'K'.repeat(43)}`)).toBeNull();
    expect(screen.getByText('tlb_KKKKKKKK…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke CI' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Revoke this key?' })).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => {
      expect(team.revokeApiKey).toHaveBeenCalledWith('shop', 1);
    });
  });

  it('AC-LP-2 shows the audit log and filters it by who and what', async () => {
    const entry = { id: 1, at: '2026-11-19T10:00:00Z', actor: { kind: 'account' as const, id: '2', label: 'ed@example.com' }, backend: 'shop', action: 'PATCH /data/:collection/:id', target: 'products/1', status: 200, denied: false, summary: { after: { title: 'New' } } };
    const audit = vi.fn(() => Promise.resolve({ entries: [entry], total: 1 }));
    await renderTeam(makeTeam({ audit }, adminMe));
    expect(await screen.findByText('ed@example.com')).toBeInTheDocument();
    expect(screen.getByText('products/1')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Who'), 'ed@');
    await waitFor(() => {
      expect(audit).toHaveBeenCalledWith('shop', expect.objectContaining({ actor: 'ed@' }));
    });
  });

  it('AC-LP-2 lists all accounts for the owner only, and lets the owner disable one', async () => {
    const accounts = vi.fn(() => Promise.resolve([{ ...account({ id: 5, email: 'x@example.com', name: 'X' }), memberships: [{ backendId: 'shop', role: 'viewer' as const }] }]));
    const team = makeTeam({ accounts }, { account: account({ owner: true }), memberships: [] });
    await renderTeam(team);
    const all = await screen.findByRole('region', { name: 'All accounts' });
    await userEvent.click(await within(all).findByRole('button', { name: 'Disable x@example.com' }));
    await waitFor(() => {
      expect(team.setDisabled).toHaveBeenCalledWith(5, true);
    });
  });

  it('AC-LP-2 shows an admin no list of all accounts', async () => {
    const team = makeTeam({}, adminMe);
    await renderTeam(team);
    await screen.findByRole('region', { name: 'Members' });
    expect(screen.queryByRole('region', { name: 'All accounts' })).toBeNull();
    expect(team.accounts).not.toHaveBeenCalled();
  });
});

describe('team server: your account (AC-LP-2)', () => {
  it('AC-LP-2 sets up two-step sign-in with a QR code, a confirming code and ten recovery codes', async () => {
    const team = makeTeam();
    renderWithApi(<Profile onClose={vi.fn()} />, teamApi(team));
    const section = await screen.findByRole('region', { name: 'Two-step sign-in' });
    await userEvent.click(within(section).getByRole('button', { name: 'Set up' }));
    expect(await within(section).findByRole('img', { name: 'QR code for the authenticator app' })).toBeInTheDocument();
    expect(within(section).getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    const turnOn = within(section).getByRole('button', { name: 'Turn on' });
    expect(turnOn).toBeDisabled();
    await userEvent.type(within(section).getByLabelText('Code from the app'), '123456');
    await userEvent.click(turnOn);
    await waitFor(() => {
      expect(team.totpEnable).toHaveBeenCalledWith('123456');
    });
    const codes = await screen.findByRole('region', { name: 'Recovery codes' });
    expect(within(codes).getAllByRole('listitem')).toHaveLength(10);
    expect(within(codes).getByText(/shown only now/)).toBeInTheDocument();
  });

  it('AC-LP-2 changes the password only when the new one is long enough and repeated', async () => {
    const team = makeTeam();
    renderWithApi(<Profile onClose={vi.fn()} />, teamApi(team));
    const form = await screen.findByRole('form', { name: 'Change password' });
    const submit = within(form).getByRole('button', { name: 'Change password' });
    await userEvent.type(within(form).getByLabelText('Current password'), 'old password');
    await userEvent.type(within(form).getByLabelText('New password'), 'short');
    expect(submit).toBeDisabled();
    await userEvent.clear(within(form).getByLabelText('New password'));
    await userEvent.type(within(form).getByLabelText('New password'), 'a much longer one');
    await userEvent.type(within(form).getByLabelText('Repeat the new password'), 'a much longer one');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(team.changePassword).toHaveBeenCalledWith('old password', 'a much longer one');
    });
  });

  it('AC-LP-2 turns two-step sign-in off only with the password', async () => {
    const team = makeTeam({}, { account: account({ totp: true, recoveryCodesLeft: 7 }), memberships: [] });
    renderWithApi(<Profile onClose={vi.fn()} />, teamApi(team));
    const section = await screen.findByRole('region', { name: 'Two-step sign-in' });
    expect(await within(section).findByText(/7 recovery codes left/)).toBeInTheDocument();
    const off = within(section).getByRole('button', { name: 'Turn off' });
    expect(off).toBeDisabled();
    await userEvent.type(within(section).getByLabelText(/Your password/), 'secret password');
    await userEvent.click(off);
    await waitFor(() => {
      expect(team.totpDisable).toHaveBeenCalledWith('secret password');
    });
  });
});

describe('team server: signing in (AC-LP-2)', () => {
  const session = (over: Partial<WebSession> = {}): WebSession => ({
    check: vi.fn(() => Promise.resolve(false)),
    login: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    onExpired: vi.fn(() => () => undefined),
    mode: () => 'password',
    loginPassword: vi.fn(() => Promise.resolve('signedIn' as const)),
    setup: vi.fn(() => Promise.resolve()),
    ...over,
  });

  it('AC-LP-2 asks for email and password, then for the authenticator code when the server says so', async () => {
    const loginPassword = vi.fn().mockResolvedValueOnce('totp').mockResolvedValueOnce('signedIn');
    render(
      <WebGate session={session({ loginPassword })}>
        <p>inside</p>
      </WebGate>,
    );
    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await userEvent.type(await screen.findByLabelText(/Authenticator code or recovery code/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('inside')).toBeInTheDocument();
    expect(loginPassword).toHaveBeenNthCalledWith(1, { email: 'me@example.com', password: 'a long password' });
    expect(loginPassword).toHaveBeenNthCalledWith(2, { email: 'me@example.com', password: 'a long password', code: '123456' });
  });

  it('AC-LP-2 shows the password form for an invitation link, sends the token from the # and then asks to sign in', async () => {
    const token = 'S'.repeat(43);
    window.location.hash = `#setup=${token}`;
    const setup = vi.fn(() => Promise.resolve());
    render(
      <WebGate session={session({ setup })}>
        <p>inside</p>
      </WebGate>,
    );
    const field = await screen.findByLabelText('New password');
    const submit = screen.getByRole('button', { name: 'Set password' });
    await userEvent.type(field, 'a long password');
    await userEvent.type(screen.getByLabelText('Repeat the password'), 'different long one');
    expect(screen.getByText('The two passwords differ.')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Repeat the password'));
    await userEvent.type(screen.getByLabelText('Repeat the password'), 'a long password');
    await userEvent.click(submit);
    await waitFor(() => {
      expect(setup).toHaveBeenCalledWith(token, 'a long password');
    });
    expect(await screen.findByText('Your password is set. Sign in.')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('AC-LP-2 keeps the one-time code form for the local web mode', async () => {
    render(
      <WebGate session={session({ mode: () => 'code' })}>
        <p>inside</p>
      </WebGate>,
    );
    expect(await screen.findByLabelText('Login code')).toBeInTheDocument();
  });
});
