import { useMutation, useQuery } from '@tanstack/react-query';

import { useApi } from '../api/context';
import type { BackendStatus } from '../api/types';
import { errorMessage } from '../lib/errors';
import { Modal } from '../ui/Modal';
import { ErrorNote } from '../ui/bits';

/** Web only: folders in the server's backends directory that are not in the list (for example ones removed from it). */
export function OpenExistingDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (backend: BackendStatus) => void }) {
  const api = useApi();
  const folders = useQuery({ queryKey: ['unlisted'], queryFn: () => api.listUnlisted() });
  const open = useMutation({ mutationFn: (name: string) => api.openNamed(name), onSuccess: onOpened });

  return (
    <Modal title="Open backend" onClose={onClose}>
      <div className="stack">
        <p className="muted">Backends live in the backends directory of the server (<code>--backends-dir</code>). These folders are there but not in your list.</p>
        {folders.data === undefined ? (
          <p className="muted">{folders.isError ? errorMessage(folders.error) : 'Looking…'}</p>
        ) : folders.data.length === 0 ? (
          <p className="muted">Every backend folder is already in the list.</p>
        ) : (
          <ul className="plain">
            {folders.data.map((name) => (
              <li key={name} className="between">
                <code>{name}</code>
                <button
                  type="button"
                  disabled={open.isPending}
                  aria-label={`Open ${name}`}
                  onClick={() => {
                    open.mutate(name);
                  }}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={open.error === null ? null : errorMessage(open.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
