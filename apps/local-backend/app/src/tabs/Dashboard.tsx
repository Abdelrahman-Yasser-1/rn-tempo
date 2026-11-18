import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import type { BackendStatus, MediaUsage, Stats } from '../api/types';
import { keys, useAdminQuery } from '../hooks/lb';
import { addressRows } from '../lib/addresses';
import { errorMessage } from '../lib/errors';
import { formatBytes, formatMs, formatPercent } from '../lib/format';
import { CopyButton } from '../ui/CopyButton';
import { QrCode } from '../ui/QrCode';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

const STATE_LINE: Record<BackendStatus['state'], string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  running: 'Running',
  error: 'Stopped with an error',
};

function Stat({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="card stat" aria-label={title}>
      <h3>
        {title} {hint === undefined ? null : <Hint text={hint} />}
      </h3>
      {children}
    </section>
  );
}

function Stats({ backend }: { backend: BackendStatus }) {
  const stats = useAdminQuery<Stats>(backend.path, '/stats', { refetchInterval: 3000 });
  const usage = useAdminQuery<MediaUsage>(backend.path, '/media/usage', { refetchInterval: 5000 });
  if (stats.isError) return <ErrorNote error={stats.error} />;
  if (stats.data === undefined) return <p className="muted">Loading the numbers…</p>;
  const data = stats.data;
  const slowest = data.endpoints.slice(0, 5);
  const collections = Object.entries(data.collections);
  return (
    <div className="stat-grid">
      <Stat title="Requests per minute">
        <p className="big-number">{data.requestsPerMinute}</p>
      </Stat>
      <Stat title="Error rate" hint="The share of answers with a status of 400 or more.">
        <p className="big-number">{formatPercent(data.errorRate)}</p>
      </Stat>
      <Stat title="Slowest endpoints">
        {slowest.length === 0 ? (
          <EmptyState>Make a request from the app and it shows up here.</EmptyState>
        ) : (
          <ul className="plain">
            {slowest.map((endpoint) => (
              <li key={endpoint.id} className="between">
                <code>{endpoint.id}</code>
                <span>{formatMs(endpoint.p95)}</span>
              </li>
            ))}
          </ul>
        )}
      </Stat>
      <Stat title="Records per collection" hint="A collection is a table of records, such as products.">
        {collections.length === 0 ? (
          <EmptyState>Add a collection in the Data tab.</EmptyState>
        ) : (
          <ul className="plain">
            {collections.map(([name, count]) => (
              <li key={name} className="between">
                <span>{name}</span>
                <span>{count}</span>
              </li>
            ))}
          </ul>
        )}
      </Stat>
      <Stat title="Media storage">
        {usage.data === undefined ? (
          <p className="muted">…</p>
        ) : (
          <p>
            <span className="big-number">{formatBytes(usage.data.bytes)}</span> in {usage.data.files} {usage.data.files === 1 ? 'file' : 'files'}
          </p>
        )}
      </Stat>
    </div>
  );
}

function Addresses({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const certs = useQuery({ queryKey: keys.admin(backend.path, 'certs'), queryFn: () => api.certInfo(backend.path) });
  const rows = addressRows(backend, certs.data?.lan ?? null);
  const phone = rows.find((row) => row.label === 'Phone on Wi-Fi')?.url ?? null;
  const open = useMutation({ mutationFn: () => api.openDocs(backend.path, 'swagger') });
  return (
    <section className="card" aria-label="Addresses">
      <h2>Addresses</h2>
      <p className="muted">Use one of these as the API address in your app.</p>
      <ul className="urls">
        {rows.map((row) => (
          <li key={row.label}>
            <span className="label">{row.label}</span>
            {row.url === null ? (
              <span className="muted">{row.note}</span>
            ) : (
              <>
                <code>{row.url}</code>
                <CopyButton text={row.url} />
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="qr-row">
        {phone === null ? null : (
          <figure>
            <QrCode text={phone} label={`QR code for ${phone}`} size={140} />
            <figcaption>Scan with a phone on the same Wi-Fi.</figcaption>
          </figure>
        )}
        <div className="links">
          <button
            type="button"
            onClick={() => {
              open.mutate();
            }}
          >
            Open the API docs (Swagger)
          </button>
          <ErrorNote error={open.error} />
        </div>
      </div>
    </section>
  );
}

/** The first tab: start or stop, where to reach the backend, and a few numbers. */
export function Dashboard({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [port, setPort] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.backends });
  const start = useMutation({
    mutationFn: (override: number | null) => api.startBackend(backend.path, override),
    onSettled: refresh,
  });
  const stop = useMutation({ mutationFn: () => api.stopBackend(backend.path), onSettled: refresh });
  const running = backend.state === 'running';
  const busy = backend.state === 'starting' || start.isPending || stop.isPending;
  const error = backend.state === 'error' ? (backend.error ?? 'The backend stopped.') : null;
  const portNumber = /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535 ? Number(port) : null;

  return (
    <div className="screen">
      <section className="card hero">
        <div className="stack">
          <h2>{STATE_LINE[backend.state]}</h2>
          <p className="muted" aria-live="polite">
            {running && backend.scheme !== null && backend.port !== null
              ? `Answering at ${backend.scheme}://localhost:${String(backend.port)}`
              : backend.state === 'starting'
                ? 'Starting the engine…'
                : 'Press Start to serve this backend.'}
          </p>
          {backend.notice === null ? null : <p className="warning">{backend.notice}</p>}
        </div>
        {running ? (
          <button
            type="button"
            className="big"
            disabled={busy}
            onClick={() => {
              stop.mutate();
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="big primary"
            disabled={busy}
            onClick={() => {
              start.mutate(null);
            }}
          >
            {backend.state === 'error' ? 'Restart' : 'Start'}
          </button>
        )}
      </section>
      <ErrorNote error={start.error === null ? null : errorMessage(start.error)} />
      <ErrorNote error={stop.error === null ? null : errorMessage(stop.error)} />
      {error === null ? null : (
        <section className="card" role="alert" aria-label="What went wrong">
          <h3>What the engine said</h3>
          <pre>{error}</pre>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              if (portNumber !== null) start.mutate(portNumber);
            }}
          >
            <label>
              Try another port
              <input
                inputMode="numeric"
                className="short"
                value={port}
                onChange={(event) => {
                  setPort(event.target.value);
                }}
                aria-invalid={port !== '' && portNumber === null}
              />
            </label>
            <button type="submit" disabled={portNumber === null || busy}>
              Start on this port
            </button>
          </form>
        </section>
      )}
      {running ? (
        <>
          <Addresses backend={backend} />
          <Stats backend={backend} />
        </>
      ) : (
        <EmptyState>Start the backend to see its addresses and numbers.</EmptyState>
      )}
    </div>
  );
}
