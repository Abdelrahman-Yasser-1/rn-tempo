import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminGet, adminSend } from '../api/client';
import { useApi, useCapabilities } from '../api/context';
import type { CollectionDef, DataPage } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { useLossFlow } from '../hooks/useLossFlow';
import { errorMessage } from '../lib/errors';
import { rowsFromImport, scalarText, toCsv } from '../lib/rows';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LossDialog } from '../ui/LossDialog';
import { Modal } from '../ui/Modal';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

import { FieldsDialog } from './FieldsDialog';
import { RowDialog } from './RowDialog';

const PAGE = 25;

function show(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = scalarText(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function NewCollection({ backend, onClose, onCreated }: { backend: string; onClose: () => void; onCreated: (name: string) => void }) {
  const api = useApi();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => adminSend(api, backend, 'POST', '/collections', { name: name.trim(), fields: [] }),
    onSuccess: () => {
      onCreated(name.trim());
    },
  });
  return (
    <Modal title="New collection" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Name
          <input
            value={name}
            placeholder="products"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <p className="muted">Start with a lowercase letter, then letters, digits or _. You add its fields next.</p>
        <ErrorNote error={create.error === null ? null : errorMessage(create.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={name.trim() === '' || create.isPending}>
            Create collection
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Rows({ backend, collection, all }: { backend: string; collection: CollectionDef; all: string[] }) {
  const api = useApi();
  const { reveal: canReveal } = useCapabilities();
  const refresh = useRefresh(backend);
  const [skip, setSkip] = useState(0);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const route = `/data/${collection.name}?limit=${String(PAGE)}&skip=${String(skip)}${q === '' ? '' : `&q=${encodeURIComponent(q)}`}`;
  const page = useAdminQuery<DataPage>(backend, route);
  const names = ['id', ...collection.fields.map((field) => field.name)];

  const removeRow = useMutation({
    mutationFn: (row: Record<string, unknown>) => adminSend(api, backend, 'DELETE', `/data/${collection.name}/${String(row.id)}`),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const dropCollection = useLossFlow(
    (confirm) => adminSend(api, backend, 'DELETE', `/collections/${collection.name}${confirm ? '?confirm=true' : ''}`),
    () => {
      setDropping(false);
      void refresh();
    },
  );

  const exportAs = useMutation({
    mutationFn: async (kind: 'json' | 'csv') => {
      const rows: Record<string, unknown>[] = [];
      for (let at = 0; at < 100_000; at += 1000) {
        const chunk = await adminGet<DataPage>(api, backend, `/data/${collection.name}?limit=1000&skip=${String(at)}`);
        rows.push(...chunk.rows);
        if (rows.length >= chunk.total || chunk.rows.length === 0) break;
      }
      const text = kind === 'json' ? `${JSON.stringify(rows, null, 2)}\n` : toCsv(collection.fields, rows);
      return { saved: await api.saveExport(collection.name, kind, text), count: rows.length };
    },
    onSuccess: ({ saved, count }) => {
      if (saved !== null) setNote(`Saved ${String(count)} records to ${saved}.`);
    },
  });
  const importRows = useMutation({
    mutationFn: async () => {
      const file = await api.pickImportFile();
      if (file === null) return null;
      const parsed = rowsFromImport(file.name, file.text, collection.fields);
      if ('error' in parsed) throw new Error(parsed.error);
      let added = 0;
      const failed: string[] = [];
      for (const [index, row] of parsed.rows.entries()) {
        try {
          await adminSend(api, backend, 'POST', `/data/${collection.name}`, row);
          added += 1;
        } catch (failure) {
          if (failed.length < 3) failed.push(`Row ${String(index + 1)}: ${errorMessage(failure)}`);
        }
      }
      return { added, failed, total: parsed.rows.length };
    },
    onSuccess: async (result) => {
      if (result === null) return;
      setNote(`Imported ${String(result.added)} of ${String(result.total)} records.${result.failed.length > 0 ? ` ${result.failed.join(' ')}` : ''}`);
      await refresh();
    },
  });
  const reveal = useMutation({ mutationFn: () => api.reveal(backend, 'database') });

  const total = page.data?.total ?? 0;
  const last = Math.min(skip + PAGE, total);

  return (
    <div className="screen">
      <div className="row">
        <h2>{collection.name}</h2>
        <span className="spacer" />
        <button type="button" onClick={() => { setFields(true); }}>
          Edit fields
        </button>
        <button type="button" className="primary" disabled={collection.fields.length === 0} onClick={() => { setEditing('new'); }}>
          Add record
        </button>
      </div>
      <div className="row">
        <label className="grow">
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder="Search text fields"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setSkip(0);
            }}
          />
        </label>
        <button type="button" onClick={() => { exportAs.mutate('json'); }} disabled={exportAs.isPending}>
          Export JSON
        </button>
        <button type="button" onClick={() => { exportAs.mutate('csv'); }} disabled={exportAs.isPending}>
          Export CSV
        </button>
        <button type="button" onClick={() => { importRows.mutate(); }} disabled={importRows.isPending || collection.fields.length === 0}>
          Import…
        </button>
        {canReveal ? (
          <button type="button" onClick={() => { reveal.mutate(); }}>
            Show database file
          </button>
        ) : null}
      </div>
      {note === null ? null : <p className="ok" role="status">{note}</p>}
      <ErrorNote error={[exportAs.error, importRows.error, reveal.error, page.error].find((item) => item !== null) ?? null} />
      {collection.fields.length === 0 ? (
        <EmptyState>This collection has no fields yet. Choose Edit fields to add the first one.</EmptyState>
      ) : page.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : page.data.rows.length === 0 ? (
        <EmptyState>{q === '' ? 'No records yet. Choose Add record, or Import a JSON or CSV file.' : 'No record matches that search.'}</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              {names.map((name) => (
                <th key={name}>{name}</th>
              ))}
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.data.rows.map((row) => (
              <tr key={String(row.id)}>
                {names.map((name) => (
                  <td key={name}>{show(row[name])}</td>
                ))}
                <td className="actions-cell">
                  <button type="button" className="ghost" aria-label={`Edit record ${String(row.id)}`} onClick={() => { setEditing(row); }}>
                    Edit
                  </button>
                  <button type="button" className="ghost bad" aria-label={`Delete record ${String(row.id)}`} onClick={() => { setDeleting(row); }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > PAGE ? (
        <div className="row">
          <button type="button" disabled={skip === 0} onClick={() => { setSkip(Math.max(0, skip - PAGE)); }}>
            Previous
          </button>
          <span className="muted">
            {skip + 1} to {last} of {total}
          </span>
          <button type="button" disabled={skip + PAGE >= total} onClick={() => { setSkip(skip + PAGE); }}>
            Next
          </button>
        </div>
      ) : null}
      <div className="row end">
        <button type="button" className="ghost bad" onClick={() => { setDropping(true); }}>
          Delete this collection
        </button>
      </div>

      {editing === null ? null : (
        <RowDialog
          backend={backend}
          collection={collection}
          {...(editing === 'new' ? {} : { row: editing })}
          onClose={() => { setEditing(null); }}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {deleting === null ? null : (
        <ConfirmDialog title="Delete this record?" confirmLabel="Delete record" busy={removeRow.isPending} onCancel={() => { setDeleting(null); }} onConfirm={() => { removeRow.mutate(deleting); }}>
          <p>
            Record <strong>{String(deleting.id)}</strong> of {collection.name} is deleted for good.
          </p>
          <ErrorNote error={removeRow.error === null ? null : errorMessage(removeRow.error)} />
        </ConfirmDialog>
      )}
      {fields ? (
        <FieldsDialog
          backend={backend}
          collection={collection}
          allCollections={all}
          onClose={() => { setFields(false); }}
          onChanged={() => {
            void refresh();
          }}
        />
      ) : null}
      {dropping && dropCollection.lost === null ? (
        <ConfirmDialog title={`Delete the collection ${collection.name}?`} confirmLabel="Delete collection" busy={dropCollection.busy} onCancel={() => { setDropping(false); }} onConfirm={() => { void dropCollection.start(); }}>
          <p>
            The collection <strong>{collection.name}</strong>, its fields and its {collection.rows ?? 0} {collection.rows === 1 ? 'record' : 'records'} are deleted. Endpoints that use it stop working until you change them.
          </p>
          <ErrorNote error={dropCollection.error} />
        </ConfirmDialog>
      ) : null}
      {dropCollection.lost === null ? null : <LossDialog message={dropCollection.lost.message} items={dropCollection.lost.items} busy={dropCollection.busy} onConfirm={() => void dropCollection.confirm()} onCancel={() => { dropCollection.cancel(); setDropping(false); }} />}
    </div>
  );
}

/** Collections on the left, the records of the chosen one on the right. */
export function Data({ backend }: { backend: string }) {
  const collections = useAdminQuery<CollectionDef[]>(backend, '/collections');
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = useRefresh(backend);

  if (collections.isError) return <ErrorNote error={collections.error} />;
  if (collections.data === undefined) return <p className="muted">Loading the collections…</p>;
  const list = collections.data;
  const current = list.find((item) => item.name === chosen) ?? list[0];

  return (
    <div className="data-layout">
      <aside className="screen" aria-label="Collections">
        <h2>
          Collections <Hint text="A collection is a table of records, such as products or orders." />
        </h2>
        {list.length === 0 ? <EmptyState>No collections yet. Choose New collection to make one.</EmptyState> : null}
        <ul className="plain">
          {list.map((item) => (
            <li key={item.name}>
              <button type="button" className={item.name === current?.name ? 'list-button active' : 'list-button'} aria-current={item.name === current?.name ? 'true' : undefined} onClick={() => { setChosen(item.name); }}>
                <span>{item.name}</span>
                <span className="muted">{item.rows ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => { setAdding(true); }}>
          New collection
        </button>
      </aside>
      <section>{current === undefined ? null : <Rows key={current.name} backend={backend} collection={current} all={list.map((item) => item.name)} />}</section>
      {adding ? (
        <NewCollection
          backend={backend}
          onClose={() => { setAdding(false); }}
          onCreated={(name) => {
            setAdding(false);
            setChosen(name);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
