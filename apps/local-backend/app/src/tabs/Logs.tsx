import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useApi } from '../api/context';
import type { BackendStatus, RequestEntry } from '../api/types';
import { keys } from '../hooks/lb';
import { useRequestLog } from '../hooks/useRequestLog';
import { errorMessage } from '../lib/errors';
import { bodyText, filterEntries, methodsSeen, networkNote, NO_FILTERS, type Filters, type StatusFilter } from '../lib/requests';
import { EmptyState, ErrorNote } from '../ui/bits';

const STATUSES: StatusFilter[] = ['all', '2xx', '3xx', '4xx', '5xx'];
const keyOf = (entry: RequestEntry): string => `${String(entry.id)}@${entry.at}`;

function Detail({ entry, onClose }: { entry: RequestEntry; onClose: () => void }) {
  return (
    <aside className="drawer" aria-label="Request detail">
      <div className="row">
        <h2 className="grow">
          <code>{entry.method}</code> {entry.url}
          {entry.operation === undefined ? null : <span className="muted"> {entry.operation}</span>}
        </h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close detail">
          ×
        </button>
      </div>
      <p className="muted">
        {entry.status === 0 ? 'Closed without an answer' : entry.status} in {entry.ms} ms at {new Date(entry.at).toLocaleTimeString()}
        {entry.scenario === undefined ? '' : ` (scenario ${entry.scenario})`}
      </p>
      {networkNote(entry.network) === null ? null : <p className="muted">Network: {networkNote(entry.network)}.</p>}
      <h3>Request headers</h3>
      <pre>{bodyText(entry.req.headers, undefined)}</pre>
      <h3>Request body</h3>
      <pre>{bodyText(entry.req.body, entry.req.truncated)}</pre>
      <h3>Answer</h3>
      <pre>{bodyText(entry.res.body, entry.res.truncated)}</pre>
      <p className="muted">Passwords, tokens and similar fields are hidden by the engine before they reach this screen.</p>
    </aside>
  );
}

function EngineLog({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const log = useQuery({ queryKey: keys.admin(backend.path, 'engine-log'), queryFn: () => api.engineLog(backend.path), refetchInterval: 3000 });
  return (
    <section className="card" aria-label="Engine log">
      <h3>Engine log</h3>
      {log.data === undefined || log.data.length === 0 ? <EmptyState>The engine has not written anything yet.</EmptyState> : <pre className="logbox">{log.data.join('\n')}</pre>}
      <ErrorNote error={log.error === null ? null : errorMessage(log.error)} />
    </section>
  );
}

/** Live requests with filters and a detail drawer, plus the engine's own log. Entries are redacted by the engine. */
export function Logs({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const log = useRequestLog(backend.path);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const shown = useMemo(() => filterEntries(log.entries, filters).reverse(), [log.entries, filters]);
  const methods = useMemo(() => methodsSeen(log.entries), [log.entries]);
  const selected = log.entries.find((entry) => keyOf(entry) === selectedKey);
  const save = useMutation({
    mutationFn: () => api.saveExport(`${backend.name}-requests`, 'json', `${JSON.stringify(shown.slice().reverse(), null, 2)}\n`),
    onSuccess: (path) => {
      if (path !== null) setNote(`Saved ${String(shown.length)} requests to ${path}.`);
    },
  });

  return (
    <div className="screen requests">
      <div className="row">
        <label>
          Method
          <select
            value={filters.method}
            onChange={(event) => {
              setFilters({ ...filters, method: event.target.value });
            }}
          >
            <option value="all">All</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) => {
              setFilters({ ...filters, status: STATUSES.find((status) => status === event.target.value) ?? 'all' });
            }}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All' : status}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Path contains
          <input
            type="search"
            value={filters.text}
            placeholder="/products"
            onChange={(event) => {
              setFilters({ ...filters, text: event.target.value });
            }}
          />
        </label>
        <button type="button" onClick={log.clear}>
          Clear
        </button>
        <button
          type="button"
          disabled={shown.length === 0 || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          Export JSON
        </button>
      </div>
      <p className="muted" role="status">
        {backend.state !== 'running' ? 'The backend is stopped.' : log.connected ? 'Live.' : 'Connecting…'} {log.entries.length} requests kept, {shown.length} shown.
      </p>
      {note === null ? null : <p className="ok">{note}</p>}
      <ErrorNote error={log.error ?? (save.error === null ? null : errorMessage(save.error))} />
      {log.entries.length === 0 ? (
        <EmptyState>No requests yet. Use the app, or send one from Try it in the Endpoints tab.</EmptyState>
      ) : (
        <div className={selected === undefined ? '' : 'split'}>
          <table className="table" aria-label="Requests">
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>URL</th>
                <th>Status</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr
                  key={keyOf(entry)}
                  className={keyOf(entry) === selectedKey ? 'selected' : undefined}
                  onClick={() => {
                    setSelectedKey(keyOf(entry));
                  }}
                >
                  <td>{new Date(entry.at).toLocaleTimeString()}</td>
                  <td>
                    <span className={`method ${entry.method.toLowerCase()}`}>{entry.method}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setSelectedKey(keyOf(entry));
                      }}
                    >
                      {entry.url}
                    </button>
                    {entry.operation === undefined ? null : <span className="muted"> {entry.operation}</span>}
                  </td>
                  <td className={entry.status > 0 && entry.status < 400 ? 'ok' : 'bad'}>{entry.status === 0 ? 'closed' : entry.status}</td>
                  <td>{entry.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selected === undefined ? null : (
            <Detail
              entry={selected}
              onClose={() => {
                setSelectedKey(null);
              }}
            />
          )}
        </div>
      )}
      <EngineLog backend={backend} />
    </div>
  );
}
