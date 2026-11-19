import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { ContentConfig, ContentTypeDef, EntryPage, EntryStatus, EntrySummary } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { useLossFlow } from '../hooks/useLossFlow';
import { labelOf, STATUS_WORDS, whenText } from '../lib/content';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LossDialog } from '../ui/LossDialog';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

import { ContentTypeDialog } from './ContentTypeDialog';
import { EntryEditor } from './EntryEditor';

/** How often the list is read again, so a scheduled entry turns Published on its own. */
const REFRESH_MS = 5000;

const nameOf = (entry: EntrySummary): string => entry.title ?? entry.slug ?? `Entry ${String(entry.id)}`;

function Entries({ backend, type, config }: { backend: string; type: ContentTypeDef; config: ContentConfig }) {
  const refresh = useRefresh(backend);
  const [status, setStatus] = useState<'' | EntryStatus>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [editingType, setEditingType] = useState(false);
  const [dropping, setDropping] = useState(false);
  const api = useApi();
  const route = `/content/entries?type=${encodeURIComponent(type.name)}&limit=200${status === '' ? '' : `&status=${status}`}${q === '' ? '' : `&q=${encodeURIComponent(q)}`}`;
  const page = useAdminQuery<EntryPage>(backend, route, { refetchInterval: REFRESH_MS });
  const dropType = useLossFlow(
    (confirm) => adminSend(api, backend, 'DELETE', `/content/types/${encodeURIComponent(type.name)}${confirm ? '?confirm=true' : ''}`),
    () => {
      setDropping(false);
      void refresh();
    },
  );
  const items = page.data?.items ?? [];
  const full = type.singleton === true && (type.entries ?? 0) > 0;
  const missingIn = (entry: EntrySummary): string[] => (type.localized === true ? config.locales.filter((code) => !entry.locales.includes(code)) : []);

  return (
    <div className="screen">
      <div className="row">
        <h2>{labelOf(type)}</h2>
        <code className="muted">/{config.mount.replace(/^\//, '')}/{type.name}</code>
        <span className="spacer" />
        <button
          type="button"
          onClick={() => {
            setEditingType(true);
          }}
        >
          Edit type
        </button>
        <button
          type="button"
          className="primary"
          disabled={full}
          onClick={() => {
            setEditing('new');
          }}
        >
          Add entry
        </button>
      </div>
      <div className="row">
        <label>
          <span className="sr-only">Status</span>
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as '' | EntryStatus);
            }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </label>
        <label className="grow">
          <span className="sr-only">Search entries</span>
          <input
            type="search"
            placeholder="Search by title or slug"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </label>
      </div>
      {full ? <p className="muted">This type holds one entry. Edit it, or delete it to start again.</p> : null}
      <ErrorNote error={page.error} />
      {page.data === undefined ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState>{status === '' && q === '' ? 'No entries yet. Choose Add entry.' : 'No entry matches.'}</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Languages</th>
              <th>Updated</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id}>
                <td>{nameOf(entry)}</td>
                <td>
                  <span className={`badge ${entry.status}`}>{STATUS_WORDS[entry.status]}</span>
                  {entry.status === 'scheduled' && entry.publishAt !== null ? <span className="muted"> {whenText(entry.publishAt)}</span> : null}
                </td>
                <td>
                  {type.localized === true ? entry.locales.join(', ') : '-'}
                  {missingIn(entry).length > 0 ? <span className="muted"> (missing: {missingIn(entry).join(', ')})</span> : null}
                </td>
                <td>{whenText(entry.updatedAt)}</td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`Edit ${nameOf(entry)}`}
                    onClick={() => {
                      setEditing(entry.id);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row end">
        <button
          type="button"
          className="ghost bad"
          onClick={() => {
            setDropping(true);
          }}
        >
          Delete this type
        </button>
      </div>

      {editing === null ? null : (
        <EntryEditor
          backend={backend}
          type={type}
          config={config}
          entryId={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      {editingType ? (
        <ContentTypeDialog
          backend={backend}
          type={type}
          onClose={() => {
            setEditingType(false);
          }}
          onSaved={() => {
            setEditingType(false);
            void refresh();
          }}
        />
      ) : null}
      {dropping && dropType.lost === null ? (
        <ConfirmDialog
          title={`Delete the content type ${labelOf(type)}?`}
          confirmLabel="Delete type"
          busy={dropType.busy}
          onCancel={() => {
            setDropping(false);
          }}
          onConfirm={() => {
            void dropType.start();
          }}
        >
          <p>
            The type <strong>{labelOf(type)}</strong>, its fields and its {type.entries ?? 0} {type.entries === 1 ? 'entry' : 'entries'} are deleted. Anything published disappears from the public API.
          </p>
          <ErrorNote error={dropType.error} />
        </ConfirmDialog>
      ) : null}
      {dropType.lost === null ? null : (
        <LossDialog
          message={dropType.lost.message}
          items={dropType.lost.items}
          busy={dropType.busy}
          onConfirm={() => void dropType.confirm()}
          onCancel={() => {
            dropType.cancel();
            setDropping(false);
          }}
        />
      )}
    </div>
  );
}

/** Content types on the left, the entries of the chosen type on the right. */
export function Content({ backend }: { backend: string }) {
  const config = useAdminQuery<ContentConfig>(backend, '/content/config');
  const types = useAdminQuery<ContentTypeDef[]>(backend, '/content/types');
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = useRefresh(backend);

  if (types.isError) return <ErrorNote error={types.error} />;
  if (config.isError) return <ErrorNote error={config.error} />;
  if (types.data === undefined || config.data === undefined) return <p className="muted">Loading the content…</p>;
  const list = types.data;
  const current = list.find((item) => item.name === chosen) ?? list[0];

  return (
    <div className="data-layout">
      <aside className="screen" aria-label="Content types">
        <h2>
          Content types <Hint text="A content type is a kind of page or message you write, such as an announcement or an FAQ. Each entry can be translated and published when you are ready." />
        </h2>
        {list.length === 0 ? <EmptyState>No content types yet. Choose Add type to make one.</EmptyState> : null}
        <ul className="plain">
          {list.map((item) => (
            <li key={item.name}>
              <button
                type="button"
                className={item.name === current?.name ? 'list-button active' : 'list-button'}
                aria-current={item.name === current?.name ? 'true' : undefined}
                onClick={() => {
                  setChosen(item.name);
                }}
              >
                <span>{labelOf(item)}</span>
                <span className="muted">{item.entries ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            setAdding(true);
          }}
        >
          Add type
        </button>
      </aside>
      <section>{current === undefined ? null : <Entries key={current.name} backend={backend} type={current} config={config.data} />}</section>
      {adding ? (
        <ContentTypeDialog
          backend={backend}
          onClose={() => {
            setAdding(false);
          }}
          onSaved={(name) => {
            setAdding(false);
            setChosen(name);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
