import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminGet, adminSend } from '../api/client';
import { useApi } from '../api/context';
import { Write } from '../hooks/team';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { CopyButton } from '../ui/CopyButton';
import { EmptyState, ErrorNote } from '../ui/bits';
import { JsonEditor } from '../ui/JsonEditor';

interface Item {
  id: number;
  endpointId: string;
  at: string;
  method: string;
  path: string;
  size: number;
  status: number;
}
interface Detail extends Item {
  query: string;
  headers: Record<string, string>;
  body: string;
  encoding: 'utf8' | 'base64';
  curl: string;
}

/** The pretty form of a JSON body, or the text itself when it is not JSON. */
export function prettyBody(detail: Pick<Detail, 'body' | 'encoding'>): { text: string; json: boolean } {
  if (detail.encoding === 'base64') return { text: detail.body, json: false };
  try {
    return { text: JSON.stringify(JSON.parse(detail.body), null, 2), json: true };
  } catch {
    return { text: detail.body, json: false };
  }
}

/**
 * The inbox: requests that `inbox` endpoints captured. Everyone who can read sees the list (method, path, time, size,
 * status). The headers, query and body open for editors only; credentials in them are already hidden.
 */
export function Inbox({ backend }: { backend: string }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const list = useAdminQuery<{ entries: Item[]; count: number; bytes: number }>(backend, '/inbox', { refetchInterval: 2000 });
  const [open, setOpen] = useState<Detail | null>(null);
  const [raw, setRaw] = useState(false);
  const [target, setTarget] = useState('');
  const [replied, setReplied] = useState<string | null>(null);
  const show = useMutation({ mutationFn: (id: number) => adminGet<Detail>(api, backend, `/inbox/${String(id)}`), onSuccess: (detail) => { setOpen(detail); setReplied(null); } });
  const clear = useMutation({ mutationFn: () => adminSend(api, backend, 'DELETE', '/inbox'), onSuccess: async () => { setOpen(null); await refresh(); } });
  const replay = useMutation({
    mutationFn: async () => {
      const answer = await adminSend<{ status: number; body: string }>(api, backend, 'POST', `/inbox/${String(open?.id ?? 0)}/replay`, { url: target.trim() });
      setReplied(`The receiver answered ${String(answer.status)}.`);
    },
  });
  const entries = list.data?.entries ?? [];
  const body = open === null ? null : prettyBody(open);

  return (
    <div className="screen">
      <section className="card" aria-label="Inbox">
        <div className="row">
          <h2>Inbox</h2>
          <span className="spacer" />
          <Write>
            <button type="button" disabled={entries.length === 0} onClick={() => clear.mutate()}>
              Clear inbox
            </button>
          </Write>
        </div>
        <p className="muted">Add an endpoint of type <code>inbox</code> (for example <code>/inbox/stripe</code>) and point a service at it. Every request it gets shows up here.</p>
        <ErrorNote error={list.isError ? list.error : show.error === null ? null : errorMessage(show.error)} />
        {entries.length === 0 ? (
          <EmptyState>Nothing was captured yet.</EmptyState>
        ) : (
          <table className="table" aria-label="Captured requests">
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Path</th>
                <th>Size</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.at).toLocaleTimeString()}</td>
                  <td>{entry.method}</td>
                  <td>
                    <code>{entry.path}</code>
                  </td>
                  <td>{entry.size} B</td>
                  <td>{entry.status}</td>
                  <td>
                    <Write>
                      <button type="button" onClick={() => show.mutate(entry.id)}>
                        Open {entry.method} {entry.path} #{entry.id}
                      </button>
                    </Write>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {open === null || body === null ? null : (
        <section className="card" aria-label="Captured request">
          <div className="row">
            <h3>
              {open.method} {open.path}
              {open.query === '' ? '' : `?${open.query}`}
            </h3>
            <span className="spacer" />
            <CopyButton text={open.curl} label="Copy as curl" />
            <button type="button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <h4>Headers</h4>
          <table className="table" aria-label="Captured headers">
            <tbody>
              {Object.entries(open.headers).map(([name, value]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>
                    <code>{value}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <h4>Body</h4>
            <label className="check">
              <input type="checkbox" checked={raw} onChange={(event) => setRaw(event.target.checked)} />
              Raw
            </label>
          </div>
          {open.size === 0 ? (
            <p className="muted">No body.</p>
          ) : raw || !body.json ? (
            <pre className="code-area" aria-label="Raw body">{open.encoding === 'base64' ? `base64: ${open.body}` : open.body}</pre>
          ) : (
            <JsonEditor label="Captured body" value={body.text} onChange={() => undefined} readOnly height={220} />
          )}
          <h4>Replay</h4>
          <form
            className="row"
            aria-label="Replay form"
            onSubmit={(event) => {
              event.preventDefault();
              replay.mutate();
            }}
          >
            <label>
              Send it to
              <input value={target} placeholder="http://localhost:3000/hook" onChange={(event) => setTarget(event.target.value)} />
            </label>
            <button type="submit" disabled={target.trim() === '' || replay.isPending}>
              Replay
            </button>
          </form>
          <ErrorNote error={replay.error === null ? null : errorMessage(replay.error)} />
          {replied === null ? null : <p role="status">{replied}</p>}
        </section>
      )}
    </div>
  );
}
