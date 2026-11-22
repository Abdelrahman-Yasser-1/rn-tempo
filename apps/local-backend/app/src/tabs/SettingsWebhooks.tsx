import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminGet, adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus } from '../api/types';
import { Write } from '../hooks/team';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { splitList, wholeIn } from '../lib/integrations';
import { CopyButton } from '../ui/CopyButton';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

interface WebhookView {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  delayMs?: number;
  retries: { max: number; baseMs: number };
  headers?: Record<string, string>;
  secretConfigured: boolean;
}
interface DeliveryView {
  id: string;
  webhookId: string;
  event: string;
  status: 'pending' | 'success' | 'failed' | 'captured';
  attempt: number;
  attempts: { n: number; ms: number; code?: number; error?: string }[];
}

interface Form {
  id: string;
  url: string;
  events: string;
  retries: string;
  delay: string;
  headers: string;
  editing: boolean;
}
const EMPTY: Form = { id: '', url: '', events: 'products.created', retries: '3', delay: '0', headers: '', editing: false };

const headerLines = (text: string): { ok: true; value: Record<string, string> } | { ok: false } => {
  const out: Record<string, string> = {};
  for (const line of text.split('\n').filter((entry) => entry.trim() !== '')) {
    const at = line.indexOf(':');
    if (at < 1) return { ok: false };
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { ok: true, value: out };
};

/** Webhooks: signed calls to a URL when events happen. The signing secret is shown once, when it is made or rotated. */
export function SettingsWebhooks({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const hooks = useAdminQuery<WebhookView[]>(backend.path, '/webhooks');
  const deliveries = useAdminQuery<DeliveryView[]>(backend.path, '/webhook-deliveries?limit=20', { refetchInterval: 3000 });
  const [form, setForm] = useState<Form | null>(null);
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<Form>): void => setForm((current) => (current === null ? current : { ...current, ...patch }));

  const save = useMutation({
    mutationFn: async (value: Form) => {
      const retries = wholeIn(value.retries, 0, 10);
      const delay = wholeIn(value.delay, 0, 60_000);
      const headers = headerLines(value.headers);
      if (retries === null || delay === null || !headers.ok) {
        setProblem(retries === null ? 'Retries is a number from 0 to 10.' : delay === null ? 'The delay is milliseconds, up to 60000.' : 'Write headers as "Name: value", one per line.');
        return false;
      }
      setProblem(null);
      const body = { id: value.id.trim(), url: value.url.trim(), events: splitList(value.events), retries: { max: retries, backoff: 'exponential', baseMs: 1000 }, ...(delay > 0 ? { delayMs: delay } : {}), ...(Object.keys(headers.value).length > 0 ? { headers: headers.value } : {}) };
      if (value.editing) await adminSend(api, backend.path, 'PUT', `/webhooks/${encodeURIComponent(value.id)}`, body);
      else {
        const made = await adminSend<{ secret: string }>(api, backend.path, 'POST', '/webhooks', body);
        setSecret({ id: body.id, value: made.secret });
      }
      return true;
    },
    onSuccess: async (saved) => {
      if (!saved) return;
      setForm(null);
      await refresh();
    },
  });
  const act = useMutation({
    mutationFn: async (action: { kind: 'rotate' | 'test' | 'delete' | 'redeliver'; id: string }) => {
      const id = encodeURIComponent(action.id);
      if (action.kind === 'rotate') setSecret({ id: action.id, value: (await adminSend<{ secret: string }>(api, backend.path, 'POST', `/webhooks/${id}/rotate-secret`)).secret });
      else if (action.kind === 'test') await adminSend(api, backend.path, 'POST', `/webhooks/${id}/test`);
      else if (action.kind === 'redeliver') await adminSend(api, backend.path, 'POST', `/webhook-deliveries/${id}/redeliver`);
      else await adminSend(api, backend.path, 'DELETE', `/webhooks/${id}`);
    },
    onSuccess: refresh,
  });
  const edit = async (id: string): Promise<void> => {
    const full = await adminGet<WebhookView>(api, backend.path, `/webhooks/${encodeURIComponent(id)}/full`);
    setForm({ id: full.id, url: full.url, events: full.events.join(', '), retries: String(full.retries.max), delay: String(full.delayMs ?? 0), headers: Object.entries(full.headers ?? {}).map(([name, value]) => `${name}: ${value}`).join('\n'), editing: true });
  };

  return (
    <section className="card" aria-label="Webhooks">
      <h2>Webhooks</h2>
      <p className="muted">
        Call a URL when something happens (<code>products.created</code>, <code>products.*</code>, or an event your handler emits). Each call is signed: <code>X-Tempo-Signature: t=&lt;unix&gt;,v1=&lt;hmac-sha256 of &quot;t.body&quot;&gt;</code>, with <code>X-Tempo-Event</code> and <code>X-Tempo-Delivery</code>.
      </p>
      {secret === null ? null : (
        <div className="notice" role="status">
          <p>
            Signing secret of <strong>{secret.id}</strong>. Copy it now: it is not shown again (rotate it to get a new one).
          </p>
          <code>{secret.value}</code> <CopyButton text={secret.value} label="Copy secret" />{' '}
          <button
            type="button"
            onClick={() => {
              setSecret(null);
            }}
          >
            Done
          </button>
        </div>
      )}
      <ErrorNote error={hooks.isError ? hooks.error : null} />
      {hooks.data?.length === 0 ? <EmptyState>No webhooks yet.</EmptyState> : null}
      {hooks.data === undefined || hooks.data.length === 0 ? null : (
        <table className="table" aria-label="Webhooks list">
          <thead>
            <tr>
              <th>Id</th>
              <th>URL</th>
              <th>Events</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {hooks.data.map((hook) => (
              <tr key={hook.id}>
                <td>{hook.id}</td>
                <td>
                  <code>{hook.url}</code>
                </td>
                <td>{hook.events.join(', ')}</td>
                <td>
                  <Write>
                    <button type="button" onClick={() => act.mutate({ kind: 'test', id: hook.id })}>
                      Send test to {hook.id}
                    </button>{' '}
                    <button type="button" onClick={() => void edit(hook.id)}>
                      Edit {hook.id}
                    </button>{' '}
                    <button type="button" onClick={() => act.mutate({ kind: 'delete', id: hook.id })}>
                      Delete {hook.id}
                    </button>
                  </Write>
                  <Write need="admin">
                    {' '}
                    <button type="button" onClick={() => act.mutate({ kind: 'rotate', id: hook.id })}>
                      Rotate secret of {hook.id}
                    </button>
                  </Write>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorNote error={act.error === null ? null : errorMessage(act.error)} />
      <Write>
        {form === null ? (
          <button
            type="button"
            className="primary"
            onClick={() => {
              setForm(EMPTY);
            }}
          >
            Add webhook
          </button>
        ) : (
          <form
            className="stack"
            aria-label="Webhook form"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(form);
            }}
          >
            <label>
              Id
              <input value={form.id} disabled={form.editing} onChange={(event) => set({ id: event.target.value })} />
            </label>
            <label>
              URL <Hint text="https only on a team server. On your own machine http://localhost works." />
              <input value={form.url} onChange={(event) => set({ url: event.target.value })} />
            </label>
            <label>
              Events (comma separated)
              <input value={form.events} onChange={(event) => set({ events: event.target.value })} />
            </label>
            <label>
              Retries
              <input value={form.retries} onChange={(event) => set({ retries: event.target.value })} />
            </label>
            <label>
              Delay (ms)
              <input value={form.delay} onChange={(event) => set({ delay: event.target.value })} />
            </label>
            <label>
              Extra headers (Name: value, one per line)
              <textarea rows={3} value={form.headers} onChange={(event) => set({ headers: event.target.value })} />
            </label>
            <ErrorNote error={problem ?? (save.error === null ? null : errorMessage(save.error))} />
            <div className="row">
              <button type="submit" className="primary" disabled={save.isPending}>
                Save webhook
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setProblem(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </Write>
      <h3>Recent deliveries</h3>
      {deliveries.data === undefined || deliveries.data.length === 0 ? (
        <EmptyState>Nothing was sent yet.</EmptyState>
      ) : (
        <table className="table" aria-label="Deliveries">
          <thead>
            <tr>
              <th>Webhook</th>
              <th>Event</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {deliveries.data.map((delivery) => (
              <tr key={delivery.id}>
                <td>{delivery.webhookId}</td>
                <td>{delivery.event}</td>
                <td>
                  {delivery.status}
                  {delivery.attempts.at(-1)?.code === undefined ? '' : ` (${String(delivery.attempts.at(-1)?.code)})`}
                </td>
                <td>{delivery.attempt}</td>
                <td>
                  <Write>
                    <button type="button" onClick={() => act.mutate({ kind: 'redeliver', id: delivery.id })}>
                      Redeliver {delivery.id}
                    </button>
                  </Write>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
