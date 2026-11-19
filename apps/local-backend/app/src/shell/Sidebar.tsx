import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi, useCapabilities } from '../api/context';
import type { BackendStatus } from '../api/types';
import { keys, useBackends } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorNote, StatusDot } from '../ui/bits';

import { atLeast } from '../api/team';
import { useMe } from '../hooks/team';

import { NewBackendDialog } from './NewBackendDialog';
import { OpenExistingDialog } from './OpenExistingDialog';
import { Profile } from './Profile';

/** The list of backends, a New backend button and an Open backend button. */
export function Sidebar({ selected, onSelect }: { selected: string | null; onSelect: (path: string | null) => void }) {
  const api = useApi();
  const { mode } = useCapabilities();
  const web = mode === 'web';
  const queryClient = useQueryClient();
  const backends = useBackends();
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [removing, setRemoving] = useState<BackendStatus | null>(null);
  const [profile, setProfile] = useState(false);
  const me = useMe();
  // On a team server only the owner makes or opens backends, and removing one takes the admin role on it.
  const team = api.team !== null;
  const isOwner = !team || me.data?.account.owner === true;
  const canRemove = (path: string): boolean => isOwner || (me.data?.memberships.some((member) => member.backendId === path && atLeast(member.role, 'admin')) ?? false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.backends });

  const open = useMutation({
    mutationFn: () => (web ? Promise.resolve(null) : api.openBackend()),
    onSuccess: async (opened) => {
      if (opened === null) return;
      await refresh();
      onSelect(opened.path);
    },
  });
  const remove = useMutation({
    mutationFn: (path: string) => api.removeBackend(path),
    onSuccess: async (_none, path) => {
      setRemoving(null);
      if (selected === path) onSelect(null);
      await refresh();
    },
  });
  const list = backends.data ?? [];

  return (
    <nav className="sidebar" aria-label="Backends">
      <h1>Tempo Local Backend</h1>
      {isOwner ? (
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setCreating(true);
          }}
        >
          New backend
        </button>
        <button
          type="button"
          onClick={() => {
            if (web) setOpening(true);
            else open.mutate();
          }}
        >
          Open backend…
        </button>
      </div>
      ) : null}
      <ErrorNote error={open.error === null ? null : errorMessage(open.error)} />
      {list.length === 0 ? (
        <p className="empty">
          {web ? 'No backends yet. Choose New backend to make one, or Open backend to bring back a folder of the backends directory.' : 'No backends yet. Choose New backend to make one, or Open backend to use a folder you have.'}
        </p>
      ) : (
        <ul>
          {list.map((backend) => (
            <li key={backend.path} className={backend.path === selected ? 'project selected' : 'project'}>
              <button
                type="button"
                className="project-main"
                aria-current={backend.path === selected ? 'true' : undefined}
                onClick={() => {
                  onSelect(backend.path);
                }}
              >
                <StatusDot state={backend.state} />
                <span className="project-name">{backend.name}</span>
              </button>
              {canRemove(backend.path) ? (
              <button
                type="button"
                className="ghost remove"
                aria-label={`Remove ${backend.name} from the list`}
                onClick={() => {
                  setRemoving(backend);
                }}
              >
                ×
              </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <NewBackendDialog
          onClose={() => {
            setCreating(false);
          }}
          onCreated={(created) => {
            setCreating(false);
            void refresh();
            onSelect(created.path);
          }}
        />
      ) : null}
      {opening ? (
        <OpenExistingDialog
          onClose={() => {
            setOpening(false);
          }}
          onOpened={(opened) => {
            setOpening(false);
            void refresh();
            onSelect(opened.path);
          }}
        />
      ) : null}
      {team && me.data !== undefined && me.data !== null ? (
        <button
          type="button"
          className="ghost account"
          onClick={() => {
            setProfile(true);
          }}
        >
          Account ({me.data.account.email})
        </button>
      ) : null}
      {profile ? <Profile onClose={() => { setProfile(false); }} /> : null}
      {api.session === null ? null : (
        <button
          type="button"
          className="ghost signout"
          onClick={() => {
            void api.session?.logout().then(() => {
              window.location.reload();
            });
          }}
        >
          Sign out
        </button>
      )}
      {removing === null ? null : (
        <ConfirmDialog
          title="Remove this backend from the list?"
          confirmLabel="Remove from list"
          busy={remove.isPending}
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            remove.mutate(removing.path);
          }}
        >
          <p>
            <strong>{removing.name}</strong> disappears from this list{removing.state === 'running' ? ' and its server stops' : ''}. {web ? ' Its folder and all its data stay in the backends directory of the server, and you can open it again later.' : ' Its folder and all its data stay on your disk, and you can open it again later.'}
          </p>
          <ErrorNote error={remove.error === null ? null : errorMessage(remove.error)} />
        </ConfirmDialog>
      )}
    </nav>
  );
}
