import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { EndpointDef, LiveClient, LiveLine } from '../api/types';
import { Write } from '../hooks/team';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { EmptyState, ErrorNote } from '../ui/bits';

/** What the send form sends: JSON when the text is JSON, else the text itself. */
export function messageData(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

const time = (iso: string): string => new Date(iso).toLocaleTimeString();

/**
 * The Live panel of an SSE, WebSocket or GraphQL endpoint: who is connected (the address is only a short hash), a form that
 * sends a message to everyone or to one client, the latest messages, and disconnecting a client. It refreshes every two seconds.
 */
export function LivePanel({ backend, endpoint, onClose }: { backend: string; endpoint: EndpointDef; onClose: () => void }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const base = `/realtime/${encodeURIComponent(endpoint.id)}`;
  const clients = useAdminQuery<{ clients: LiveClient[] }>(backend, `${base}/clients`, { refetchInterval: 2000 });
  const messages = useAdminQuery<{ messages: LiveLine[] }>(backend, `${base}/messages`, { refetchInterval: 2000 });
  const [event, setEvent] = useState('');
  const [data, setData] = useState('');
  const [target, setTarget] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const live = clients.data?.clients ?? [];
  const kind: string = endpoint.type;
  const canSend = kind !== 'graphql';

  const send = useMutation({
    mutationFn: () =>
      adminSend<{ sent: number }>(api, backend, 'POST', `${base}/send`, {
        data: messageData(data),
        ...(event.trim() === '' ? {} : { event: event.trim() }),
        ...(target === '' ? {} : { clientId: target }),
      }),
    onSuccess: async (result) => {
      setSent(`Sent to ${String(result.sent)} ${result.sent === 1 ? 'client' : 'clients'}.`);
      await refresh();
    },
  });
  const drop = useMutation({
    mutationFn: (id: string) => adminSend(api, backend, 'DELETE', `${base}/clients/${encodeURIComponent(id)}`),
    onSuccess: refresh,
  });

  return (
    <section className="card live" aria-label="Live">
      <div className="row">
        <h2>Live: {endpoint.path}</h2>
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <h3>Connected clients ({live.length})</h3>
      {live.length === 0 ? (
        <EmptyState>Nobody is connected. Open the address from your app, or with curl -N, and it shows up here.</EmptyState>
      ) : (
        <table className="table" aria-label="Connected clients">
          <thead>
            <tr>
              <th>Client</th>
              <th>Connected</th>
              <th>Address (hash)</th>
              <th>In</th>
              <th>Out</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {live.map((client) => (
              <tr key={client.id}>
                <td>
                  <code>{client.id}</code>
                  {client.user === undefined ? null : <span className="muted"> {client.user}</span>}
                </td>
                <td>{time(client.connectedAt)}</td>
                <td>
                  <code>{client.ipHash}</code>
                </td>
                <td>{client.messagesIn}</td>
                <td>{client.messagesOut}</td>
                <td className="actions-cell">
                  <Write>
                    <button
                      type="button"
                      className="ghost bad"
                      aria-label={`Disconnect ${client.id}`}
                      onClick={() => {
                        drop.mutate(client.id);
                      }}
                    >
                      Disconnect
                    </button>
                  </Write>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorNote error={drop.error === null ? null : errorMessage(drop.error)} />
      {canSend ? (
        <Write>
          <form
            className="stack"
            aria-label="Send a message"
            onSubmit={(submitted) => {
              submitted.preventDefault();
              setSent(null);
              send.mutate();
            }}
          >
            <h3>Send a message</h3>
            <div className="row">
              <label>
                Send to
                <select
                  value={target}
                  onChange={(changed) => {
                    setTarget(changed.target.value);
                  }}
                >
                  <option value="">Everyone</option>
                  {live.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.id}
                    </option>
                  ))}
                </select>
              </label>
              {kind !== 'graphql' ? (
                <label>
                  Event name (optional)
                  <input
                    value={event}
                    onChange={(changed) => {
                      setEvent(changed.target.value);
                    }}
                  />
                </label>
              ) : null}
            </div>
            <label>
              Message (text or JSON)
              <textarea
                rows={3}
                value={data}
                onChange={(changed) => {
                  setData(changed.target.value);
                }}
              />
            </label>
            <div className="row">
              <button type="submit" className="primary" disabled={send.isPending || data.trim() === ''}>
                Send
              </button>
              {sent === null ? null : (
                <span className="ok" role="status">
                  {sent}
                </span>
              )}
            </div>
            <ErrorNote error={send.error === null ? null : errorMessage(send.error)} />
          </form>
        </Write>
      ) : null}
      <h3>Recent messages</h3>
      {(messages.data?.messages ?? []).length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ul className="live-log" aria-label="Recent messages">
          {[...(messages.data?.messages ?? [])].reverse().map((line, index) => (
            <li key={`${line.at}-${String(index)}`}>
              <span className="muted">{time(line.at)}</span> <span className="badge">{line.direction}</span>
              {line.clientId === undefined ? null : <code> {line.clientId}</code>}
              {line.event === undefined ? null : <strong> {line.event}</strong>} <span>{line.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
