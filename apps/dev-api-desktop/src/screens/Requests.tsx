import { useMemo, useState } from 'react';

import type { ProjectInfo, RequestEntry } from '../client/types';
import { useProjectState } from '../hooks/queries';
import { useRequestLog } from '../hooks/useRequestLog';
import { bodyText, filterEntries, methodsSeen, NO_FILTERS, type Filters, type StatusFilter } from '../lib/requests';

const STATUSES: StatusFilter[] = ['all', '2xx', '3xx', '4xx', '5xx'];

function Detail({ entry, onClose }: { entry: RequestEntry; onClose: () => void }) {
  return (
    <aside className="drawer" aria-label="Request detail">
      <div className="row">
        <h2 className="grow">
          <code>{entry.method}</code> {entry.url}
        </h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close detail">
          ×
        </button>
      </div>
      <p className="muted">
        {entry.status} in {entry.ms} ms at {new Date(entry.at).toLocaleTimeString()}
        {entry.scenario === undefined ? '' : ` (scenario ${entry.scenario})`}
      </p>
      <h3>Request headers</h3>
      <pre>{bodyText(entry.req.headers, undefined)}</pre>
      <h3>Request body</h3>
      <pre>{bodyText(entry.req.body, entry.req.truncated)}</pre>
      <h3>Response body</h3>
      <pre>{bodyText(entry.res.body, entry.res.truncated)}</pre>
      <p className="muted">Tokens, passwords and similar fields are redacted by the server before they reach this screen.</p>
    </aside>
  );
}

export function Requests({ project }: { project: ProjectInfo }) {
  const state = useProjectState(project.path);
  const running = state.data?.running === true;
  const log = useRequestLog(project.path);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shown = useMemo(() => filterEntries(log.entries, filters).reverse(), [log.entries, filters]);
  const methods = useMemo(() => methodsSeen(log.entries), [log.entries]);
  const selected = log.entries.find((entry) => `${entry.id}@${entry.at}` === selectedId);

  return (
    <div className="screen requests">
      <div className="row">
        <label>
          Method
          <select value={filters.method} onChange={(event) => setFilters({ ...filters, method: event.target.value })}>
            <option value="all">all</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: STATUSES.find((s) => s === event.target.value) ?? 'all' })}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Path contains
          <input type="search" value={filters.text} onChange={(event) => setFilters({ ...filters, text: event.target.value })} placeholder="/products" />
        </label>
        <button type="button" onClick={log.clear}>
          Clear
        </button>
      </div>
      <p className="muted" role="status">
        {!running ? 'The server is stopped.' : log.connected ? 'Live.' : 'Connecting…'} {log.entries.length} requests kept, {shown.length} shown.
      </p>
      {log.error !== null && (
        <p className="error" role="alert">
          {log.error}
        </p>
      )}
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
            {shown.map((entry) => {
              const key = `${entry.id}@${entry.at}`;
              return (
                <tr key={key} className={key === selectedId ? 'selected' : undefined} onClick={() => setSelectedId(key)}>
                  <td>{new Date(entry.at).toLocaleTimeString()}</td>
                  <td>
                    <span className={`method ${entry.method.toLowerCase()}`}>{entry.method}</span>
                  </td>
                  <td>
                    <button type="button" className="link" onClick={() => setSelectedId(key)}>
                      {entry.url}
                    </button>
                  </td>
                  <td className={entry.status < 400 ? 'ok' : 'bad'}>{entry.status}</td>
                  <td>{entry.ms}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {selected !== undefined && <Detail entry={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}
