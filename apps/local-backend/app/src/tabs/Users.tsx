import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { AppUser, Session, UsersPage } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

const when = (iso: string): string => iso.replace('T', ' ').replace(/\..*$/, '').replace('Z', ' UTC');

function AddUser({ backend, onClose, onSaved }: { backend: string; onClose: () => void; onSaved: () => void }) {
  const api = useApi();
  const [form, setForm] = useState({ username: '', password: '', email: '', firstName: '', lastName: '' });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };
  const save = useMutation({
    mutationFn: () => adminSend(api, backend, 'POST', '/users', Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim() !== ''))),
    onSuccess: onSaved,
  });
  return (
    <Modal title="Add a user" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          Username
          <input value={form.username} onChange={set('username')} autoComplete="off" />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
        </label>
        <label>
          Email (optional)
          <input value={form.email} onChange={set('email')} />
        </label>
        <div className="row">
          <label className="grow">
            First name (optional)
            <input value={form.firstName} onChange={set('firstName')} />
          </label>
          <label className="grow">
            Last name (optional)
            <input value={form.lastName} onChange={set('lastName')} />
          </label>
        </div>
        <ErrorNote error={save.error === null ? null : errorMessage(save.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={form.username.trim() === '' || form.password === '' || save.isPending}>
            Add user
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ backend, user, onClose, onSaved }: { backend: string; user: AppUser; onClose: () => void; onSaved: () => void }) {
  const api = useApi();
  const [password, setPassword] = useState('');
  const save = useMutation({ mutationFn: () => adminSend(api, backend, 'POST', `/users/${encodeURIComponent(String(user.id))}/password`, { password }), onSuccess: onSaved });
  return (
    <Modal title={`Reset the password of ${user.username}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label>
          New password
          <input type="password" value={password} autoComplete="new-password" onChange={(event) => { setPassword(event.target.value); }} />
        </label>
        <p className="muted">{user.username} is signed out everywhere and logs in with the new password.</p>
        <ErrorNote error={save.error === null ? null : errorMessage(save.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={password === '' || save.isPending}>
            Reset password
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Pending = { kind: 'signout' | 'delete' | 'disable'; user: AppUser };

/** The app users: add, reset a password, disable, sign out everywhere, and see who is signed in. */
export function Users({ backend }: { backend: string }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const users = useAdminQuery<UsersPage>(backend, `/users?limit=100${q === '' ? '' : `&q=${encodeURIComponent(q)}`}`);
  const sessions = useAdminQuery<{ sessions: Session[] }>(backend, '/sessions');

  const act = useMutation({
    mutationFn: async (item: Pending) => {
      const id = String(item.user.id);
      if (item.kind === 'signout') {
        const answer = await adminSend<{ revoked: number }>(api, backend, 'POST', `/users/${encodeURIComponent(id)}/revoke`);
        return `${item.user.username} was signed out of ${String(answer.revoked)} ${answer.revoked === 1 ? 'session' : 'sessions'}. Their access tokens stopped working at once.`;
      }
      if (item.kind === 'delete') {
        await adminSend(api, backend, 'DELETE', `/users/${encodeURIComponent(id)}`);
        return `${item.user.username} was deleted.`;
      }
      await adminSend(api, backend, 'POST', `/users/${encodeURIComponent(id)}/${item.user.disabled ? 'enable' : 'disable'}`);
      return item.user.disabled ? `${item.user.username} can log in again.` : `${item.user.username} is disabled and signed out.`;
    },
    onSuccess: async (message) => {
      setPending(null);
      setNote(message);
      await refresh();
    },
  });
  const endSession = useMutation({ mutationFn: (session: Session) => adminSend(api, backend, 'DELETE', `/sessions/${encodeURIComponent(String(session.id))}`), onSuccess: refresh });

  const list = users.data?.users ?? [];
  const active = sessions.data?.sessions ?? [];
  const confirmText = (item: Pending): React.ReactNode =>
    item.kind === 'signout' ? (
      <p>
        <strong>{item.user.username}</strong> is signed out on every device. Their saved tokens stop working right away, and they must log in again.
      </p>
    ) : item.kind === 'delete' ? (
      <p>
        <strong>{item.user.username}</strong> and their sign-ins are deleted for good. Records that belong to them stay.
      </p>
    ) : (
      <p>
        <strong>{item.user.username}</strong> can no longer log in and is signed out everywhere. You can enable them again later.
      </p>
    );

  return (
    <div className="screen">
      <div className="row">
        <h2>
          Users <Hint text="App users are the people who log in to your app. They live in this backend's database." />
        </h2>
        <span className="spacer" />
        <label>
          <span className="sr-only">Search users</span>
          <input type="search" placeholder="Search users" value={q} onChange={(event) => { setQ(event.target.value); }} />
        </label>
        <button type="button" className="primary" onClick={() => { setAdding(true); }}>
          Add user
        </button>
      </div>
      {note === null ? null : (
        <p className="ok" role="status">
          {note}
        </p>
      )}
      <ErrorNote error={users.error ?? act.error ?? endSession.error} />
      {users.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <EmptyState>{q === '' ? 'No users yet. Choose Add user, or let the app register one.' : 'No user matches that search.'}</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{`${user.firstName} ${user.lastName}`.trim()}</td>
                <td>{user.email}</td>
                <td>{user.disabled ? 'Disabled' : 'Active'}</td>
                <td className="actions-cell">
                  <button type="button" className="ghost" aria-label={`Reset password of ${user.username}`} onClick={() => { setResetting(user); }}>
                    Reset password
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`${user.disabled ? 'Enable' : 'Disable'} ${user.username}`}
                    onClick={() => {
                      if (user.disabled) act.mutate({ kind: 'disable', user });
                      else setPending({ kind: 'disable', user });
                    }}
                  >
                    {user.disabled ? 'Enable' : 'Disable'}
                  </button>
                  <button type="button" className="ghost" aria-label={`Sign out ${user.username} everywhere`} onClick={() => { setPending({ kind: 'signout', user }); }}>
                    Sign out everywhere
                  </button>
                  <button type="button" className="ghost bad" aria-label={`Delete ${user.username}`} onClick={() => { setPending({ kind: 'delete', user }); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section className="card" aria-label="Sessions">
        <h3>Signed in now</h3>
        {active.length === 0 ? (
          <EmptyState>Nobody is signed in. A session starts when the app logs in.</EmptyState>
        ) : (
          <ul className="plain">
            {active.map((session) => (
              <li key={session.id} className="between">
                <span>
                  <strong>{session.username}</strong> <span className="muted">since {when(session.createdAt)}, until {when(session.expiresAt)}</span>
                </span>
                <button type="button" className="ghost" aria-label={`End the session of ${session.username} (${String(session.id)})`} onClick={() => { endSession.mutate(session); }}>
                  End session
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {adding ? (
        <AddUser
          backend={backend}
          onClose={() => { setAdding(false); }}
          onSaved={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : null}
      {resetting === null ? null : (
        <ResetPassword
          backend={backend}
          user={resetting}
          onClose={() => { setResetting(null); }}
          onSaved={() => {
            setNote(`${resetting.username}'s password was reset and they were signed out.`);
            setResetting(null);
            void refresh();
          }}
        />
      )}
      {pending === null ? null : (
        <ConfirmDialog
          title={pending.kind === 'signout' ? 'Sign out everywhere?' : pending.kind === 'delete' ? 'Delete this user?' : 'Disable this user?'}
          confirmLabel={pending.kind === 'signout' ? 'Sign out everywhere' : pending.kind === 'delete' ? 'Delete user' : 'Disable user'}
          busy={act.isPending}
          onCancel={() => { setPending(null); }}
          onConfirm={() => { act.mutate(pending); }}
        >
          {confirmText(pending)}
        </ConfirmDialog>
      )}
    </div>
  );
}
