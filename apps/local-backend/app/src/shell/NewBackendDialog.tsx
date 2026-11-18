import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import type { BackendStatus, FolderPick, Preset } from '../api/types';
import { errorMessage } from '../lib/errors';
import { Modal } from '../ui/Modal';
import { ErrorNote } from '../ui/bits';

/** Two steps: pick an empty folder, then pick what the backend starts with. */
export function NewBackendDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (backend: BackendStatus) => void }) {
  const api = useApi();
  const [folder, setFolder] = useState<FolderPick | null>(null);
  const [preset, setPreset] = useState<Preset>('tempo-template');
  const [name, setName] = useState('');
  const [port, setPort] = useState('');

  const pick = useMutation({
    mutationFn: () => api.pickNewFolder(),
    onSuccess: (picked) => {
      if (picked === null) return;
      setFolder(picked);
      const last = picked.path.split('/').filter(Boolean).pop() ?? 'backend';
      setName((current) => (current === '' ? last : current));
    },
  });
  const portNumber = port === '' ? null : /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535 ? Number(port) : undefined;
  const create = useMutation({
    mutationFn: () => {
      if (folder === null) throw new Error('Choose a folder first.');
      return api.createBackend(folder.path, name.trim() === '' ? 'backend' : name.trim(), preset, portNumber ?? null);
    },
    onSuccess: onCreated,
  });
  const usable = folder !== null && folder.empty && !folder.hasBackend;

  return (
    <Modal title="New backend" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (usable && portNumber !== undefined) create.mutate();
        }}
      >
        <fieldset className="step">
          <legend>Step 1. Choose a folder</legend>
          <p className="muted">The backend keeps its files here. The folder must be empty or new.</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                pick.mutate();
              }}
            >
              {folder === null ? 'Choose folder…' : 'Choose another folder…'}
            </button>
            {folder === null ? null : <code className="path-chip">{folder.path}</code>}
          </div>
          {folder !== null && !folder.empty ? <p className="error">That folder is not empty. Choose an empty or new folder.</p> : null}
          <ErrorNote error={pick.error === null ? null : errorMessage(pick.error)} />
        </fieldset>
        <fieldset className="step" disabled={!usable}>
          <legend>Step 2. Choose what it starts with</legend>
          <label className="choice">
            <input
              type="radio"
              name="preset"
              checked={preset === 'tempo-template'}
              onChange={() => {
                setPreset('tempo-template');
              }}
            />
            <span>
              <strong>Tempo template</strong> (ready for the template app)
              <br />
              <span className="muted">Login, profile, 100 products and the rest of the template&apos;s API, with a test user.</span>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="preset"
              checked={preset === 'empty'}
              onChange={() => {
                setPreset('empty');
              }}
            />
            <span>
              <strong>Empty</strong>
              <br />
              <span className="muted">Nothing yet. Add your own endpoints and data.</span>
            </span>
          </label>
          <div className="row">
            <label>
              Name
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </label>
            <label>
              Port <span className="muted">(optional, 8443 if empty)</span>
              <input
                className="short"
                inputMode="numeric"
                value={port}
                aria-invalid={portNumber === undefined}
                onChange={(event) => {
                  setPort(event.target.value);
                }}
              />
            </label>
          </div>
        </fieldset>
        <ErrorNote error={create.error === null ? null : errorMessage(create.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!usable || portNumber === undefined || create.isPending}>
            Create backend
          </button>
        </div>
      </form>
    </Modal>
  );
}
