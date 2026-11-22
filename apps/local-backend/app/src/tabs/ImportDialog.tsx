import { useMutation } from '@tanstack/react-query';
import { useState, type DragEvent } from 'react';

import { adminSend } from '../api/client';
import { useApi, useCapabilities } from '../api/context';
import type { ChangeChoice, ImportApplied, ImportChoices, ImportDiffEntry, ImportPreview, ImportSource } from '../api/types';
import { countChoices, defaultChoices, setAll } from '../lib/importChoices';
import { errorMessage } from '../lib/errors';
import { ErrorNote } from '../ui/bits';
import { Modal } from '../ui/Modal';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const FORMATS: Record<string, string> = { 'openapi-3.0': 'OpenAPI 3.0', 'openapi-3.1': 'OpenAPI 3.1', 'swagger-2.0': 'Swagger 2.0' };
const CHOICE_LABELS: Record<ChangeChoice, string> = { 'take-new': 'Take the new one', 'keep-mine': 'Keep mine', merge: 'Merge' };

const bodyOf = (source: ImportSource): Record<string, unknown> => (source.kind === 'file' ? { text: source.text, name: source.name } : { url: source.url });

interface Props {
  backend: string;
  onClose: () => void;
  onDone: (result: ImportApplied) => void;
}

function Row({ entry, children }: { entry: ImportDiffEntry; children: React.ReactNode }) {
  return (
    <li className="import-row">
      <span className={`method ${entry.method.toLowerCase()}`}>{entry.method}</span> <code>{entry.path}</code>
      {entry.summary === undefined ? null : <span className="muted"> {entry.summary}</span>}
      {children}
    </li>
  );
}

/** Import an OpenAPI or Swagger file (a file, or an address), review what it would do, then apply it. */
export function ImportDialog({ backend, onClose, onDone }: Props) {
  const api = useApi();
  const { mode } = useCapabilities();
  const [source, setSource] = useState<ImportSource | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<ImportChoices | null>(null);
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const previewing = useMutation({
    mutationFn: async (next: ImportSource) => ({ next, result: await adminSend<ImportPreview>(api, backend, 'POST', '/import/preview', bodyOf(next)) }),
    onSuccess: ({ next, result }) => {
      setSource(next);
      setPreview(result);
      setChoices(defaultChoices(result.diff));
    },
  });
  const applying = useMutation({
    mutationFn: async () => {
      if (source === null || preview === null || choices === null) throw new Error('Choose a file first.');
      return adminSend<ImportApplied>(api, backend, 'POST', '/import/apply', { ...bodyOf(source), choices, expectHash: preview.hash });
    },
    onSuccess: onDone,
  });
  const pick = useMutation({
    mutationFn: () => api.pickApiFile(),
    onSuccess: (file) => {
      if (file !== null) previewing.mutate({ kind: 'file', name: file.name, text: file.text });
    },
  });

  const readDropped = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    if (file.size > MAX_FILE_BYTES) {
      setReadError('That file is larger than 8 MB.');
      return;
    }
    setReadError(null);
    previewing.mutate({ kind: 'file', name: file.name, text: await file.text() });
  };
  const onDrop = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault();
    setDragging(false);
    void readDropped(event.dataTransfer.files[0]);
  };

  const error = [previewing.error, applying.error, pick.error].find((item) => item !== null);

  if (preview === null || choices === null) {
    return (
      <Modal title="Import an API file" onClose={onClose} wide>
        <p className="muted">Choose an OpenAPI 3.0/3.1 or Swagger 2.0 file (JSON or YAML). Each operation becomes an endpoint; every documented response becomes a scenario.</p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={pick.isPending || previewing.isPending}
            onClick={() => {
              pick.mutate();
            }}
          >
            Choose a file…
          </button>
        </div>
        {mode === 'web' ? (
          <div
            className={dragging ? 'dropzone dragging' : 'dropzone'}
            role="region"
            aria-label="Drop an API file here"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
          >
            <p className="muted">Or drop the file here.</p>
          </div>
        ) : null}
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim() !== '') previewing.mutate({ kind: 'url', url: url.trim() });
          }}
        >
          <label className="grow">
            <span>From URL</span>
            <input
              type="url"
              placeholder="https://example.com/openapi.json"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={url.trim() === '' || previewing.isPending}>
            Preview
          </button>
        </form>
        {previewing.isPending ? <p role="status">Reading the file…</p> : null}
        <ErrorNote error={readError ?? (error === undefined ? null : errorMessage(error))} />
        <div className="row">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  const { diff } = preview;
  const totals = countChoices(choices);
  const set = (patch: Partial<ImportChoices>): void => {
    setChoices({ ...choices, ...patch });
  };

  return (
    <Modal title="Review the import" onClose={onClose} wide>
      <p>
        <strong>{preview.total}</strong> endpoint{preview.total === 1 ? '' : 's'} from <code>{preview.source}</code> ({FORMATS[preview.format] ?? preview.format})
      </p>
      <table className="table" aria-label="Endpoints per tag">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Endpoints</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(preview.byTag).map(([tag, count]) => (
            <tr key={tag}>
              <td>{tag}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.warnings.length === 0 ? null : (
        <details open>
          <summary>
            {preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}
          </summary>
          <ul aria-label="Warnings">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}

      {diff.added.length === 0 ? null : (
        <section aria-label="New endpoints">
          <div className="row">
            <h3>{preview.firstImport ? 'Endpoints to add' : 'New in the file'} ({diff.added.length})</h3>
            <span className="spacer" />
            <button type="button" className="ghost" onClick={() => { set({ add: setAll(choices.add, true) }); }}>
              Select all
            </button>
            <button type="button" className="ghost" onClick={() => { set({ add: setAll(choices.add, false) }); }}>
              Select none
            </button>
          </div>
          <ul className="import-list">
            {diff.added.map((entry) => (
              <Row key={entry.id} entry={entry}>
                <label className="choice">
                  <input type="checkbox" checked={choices.add[entry.id] ?? true} aria-label={`Add ${entry.method} ${entry.path}`} onChange={(event) => { set({ add: { ...choices.add, [entry.id]: event.target.checked } }); }} />
                  <span>Add</span>
                </label>
              </Row>
            ))}
          </ul>
        </section>
      )}

      {diff.changed.length === 0 ? null : (
        <section aria-label="Changed endpoints">
          <div className="row">
            <h3>Changed in the file ({diff.changed.length})</h3>
            <span className="spacer" />
            {(['take-new', 'keep-mine', 'merge'] as const).map((choice) => (
              <button key={choice} type="button" className="ghost" onClick={() => { set({ change: setAll(choices.change, choice) }); }}>
                {CHOICE_LABELS[choice]} for all
              </button>
            ))}
          </div>
          <ul className="import-list">
            {diff.changed.map((entry) => (
              <Row key={entry.id} entry={entry}>
                {entry.customized === true ? <span className="badge"> you edited it</span> : null}
                <ul className="muted">
                  {(entry.changes ?? []).map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
                <label>
                  <span className="sr-only">What to do with {entry.method} {entry.path}</span>
                  <select
                    aria-label={`What to do with ${entry.method} ${entry.path}`}
                    value={choices.change[entry.id] ?? 'keep-mine'}
                    onChange={(event) => { set({ change: { ...choices.change, [entry.id]: event.target.value as ChangeChoice } }); }}
                  >
                    {(Object.keys(CHOICE_LABELS) as ChangeChoice[]).map((choice) => (
                      <option key={choice} value={choice}>
                        {CHOICE_LABELS[choice]}
                      </option>
                    ))}
                  </select>
                </label>
              </Row>
            ))}
          </ul>
          <p className="muted">Merge adds new scenarios and updates the schemas, and keeps your response bodies, statuses, headers and delays.</p>
        </section>
      )}

      {diff.removed.length === 0 ? null : (
        <section aria-label="Endpoints not in the file any more">
          <div className="row">
            <h3>Not in the file any more ({diff.removed.length})</h3>
            <span className="spacer" />
            <button type="button" className="ghost" onClick={() => { set({ remove: setAll(choices.remove, true) }); }}>
              Delete all
            </button>
            <button type="button" className="ghost" onClick={() => { set({ remove: setAll(choices.remove, false) }); }}>
              Keep all
            </button>
          </div>
          <ul className="import-list">
            {diff.removed.map((entry) => (
              <Row key={entry.id} entry={entry}>
                {entry.customized === true ? <span className="badge"> you edited it</span> : null}
                <label className="choice">
                  <input type="checkbox" checked={choices.remove[entry.id] ?? false} aria-label={`Delete ${entry.method} ${entry.path}`} onChange={(event) => { set({ remove: { ...choices.remove, [entry.id]: event.target.checked } }); }} />
                  <span>Delete</span>
                </label>
              </Row>
            ))}
          </ul>
        </section>
      )}

      {diff.skipped.length === 0 ? null : (
        <p className="muted">
          Left out because another endpoint answers the same route: {diff.skipped.map((entry) => `${entry.method} ${entry.path}`).join(', ')}.
        </p>
      )}
      {diff.unchanged.length === 0 ? null : <p className="muted">{diff.unchanged.length} endpoint{diff.unchanged.length === 1 ? ' is' : 's are'} the same as before.</p>}
      <ErrorNote error={error === undefined ? null : errorMessage(error)} />
      <div className="row">
        <button
          type="button"
          onClick={() => {
            setPreview(null);
            setChoices(null);
          }}
        >
          Back
        </button>
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={applying.isPending}
          onClick={() => {
            applying.mutate();
          }}
        >
          Apply ({totals.added} added, {totals.changed} changed, {totals.removed} deleted)
        </button>
      </div>
    </Modal>
  );
}
