import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import type { BackendStatus } from '../api/types';
import { keys, useBackends } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorNote, StatusDot } from '../ui/bits';

import { NewBackendDialog } from './NewBackendDialog';

/** The list of backends, a New backend button and an Open backend button. */
export function Sidebar({ selected, onSelect }: { selected: string | null; onSelect: (path: string | null) => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const backends = useBackends();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<BackendStatus | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.backends });

  const open = useMutation({
    mutationFn: () => api.openBackend(),
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
            open.mutate();
          }}
        >
          Open backend…
        </button>
      </div>
      <ErrorNote error={open.error === null ? null : errorMessage(open.error)} />
      {list.length === 0 ? (
        <p className="empty">No backends yet. Choose New backend to make one, or Open backend to use a folder you have.</p>
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
            <strong>{removing.name}</strong> disappears from this list{removing.state === 'running' ? ' and its server stops' : ''}. Its folder and all its data stay on your disk, and you can open it again later.
          </p>
          <ErrorNote error={remove.error === null ? null : errorMessage(remove.error)} />
        </ConfirmDialog>
      )}
    </nav>
  );
}
