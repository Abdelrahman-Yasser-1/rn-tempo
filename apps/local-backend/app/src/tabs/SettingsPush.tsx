import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { EmptyState, ErrorNote, Hint } from '../ui/bits';

interface PushView {
  fcm: { configured: boolean; projectId?: string };
  apns: { configured: boolean; keyId?: string; teamId?: string; bundleId?: string };
  history: { id: number; at: string; platform: string; token: string; status: number; ok: boolean; reason: string | null }[];
}
interface SendResult {
  ok: boolean;
  status: number;
  reason?: string;
  response?: unknown;
}

/**
 * Push test sender: FCM (service account) and APNs (.p8 key) credentials, and a form that sends one test push. The page
 * never shows a credential: only that it is set up, and its project or key id.
 */
export function SettingsPush({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const push = useAdminQuery<PushView>(backend.path, '/push');
  const [account, setAccount] = useState('');
  const [apns, setApns] = useState({ key: '', keyId: '', teamId: '', bundleId: '' });
  const [send, setSend] = useState({ platform: 'fcm', token: '', title: '', body: '', data: '', sandbox: true });
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const upload = useMutation({
    mutationFn: async (platform: 'fcm' | 'apns') => {
      await adminSend(api, backend.path, 'PUT', `/push/${platform}`, platform === 'fcm' ? { serviceAccount: account } : apns);
      if (platform === 'fcm') setAccount('');
      else setApns({ key: '', keyId: '', teamId: '', bundleId: '' });
    },
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (platform: 'fcm' | 'apns') => adminSend(api, backend.path, 'DELETE', `/push/${platform}`), onSuccess: refresh });
  const test = useMutation({
    mutationFn: async () => {
      let data: unknown;
      if (send.data.trim() !== '') {
        try {
          data = JSON.parse(send.data);
        } catch {
          setProblem('Data must be a JSON object.');
          return;
        }
      }
      setProblem(null);
      setResult(await adminSend<SendResult>(api, backend.path, 'POST', '/push/send', { platform: send.platform, token: send.token.trim(), ...(send.title === '' ? {} : { title: send.title }), ...(send.body === '' ? {} : { body: send.body }), ...(data === undefined ? {} : { data }), ...(send.platform === 'apns' ? { sandbox: send.sandbox } : {}) }));
    },
    onSuccess: refresh,
  });

  return (
    <section className="card" aria-label="Push">
      <h2>Push notifications</h2>
      <p className="muted">
        Send a test push to a real device token. Credentials are kept in <code>.data/secrets.json</code> (never exported or committed) and are not shown here.
      </p>
      <ErrorNote error={push.isError ? push.error : null} />
      <div className="grid-2">
        <div className="stack">
          <h3>FCM (Android and iOS via Firebase)</h3>
          <p role="status">{push.data?.fcm.configured === true ? `Configured: project ${push.data.fcm.projectId ?? ''}` : 'Not configured'}</p>
          <label>
            Service account JSON
            <textarea rows={4} spellCheck={false} value={account} onChange={(event) => setAccount(event.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="primary" disabled={account.trim() === '' || upload.isPending} onClick={() => upload.mutate('fcm')}>
              Save service account
            </button>
            {push.data?.fcm.configured === true ? (
              <button type="button" onClick={() => remove.mutate('fcm')}>
                Delete FCM credentials
              </button>
            ) : null}
          </div>
        </div>
        <div className="stack">
          <h3>APNs (iOS)</h3>
          <p role="status">{push.data?.apns.configured === true ? `Configured: key ${push.data.apns.keyId ?? ''}, team ${push.data.apns.teamId ?? ''}, ${push.data.apns.bundleId ?? ''}` : 'Not configured'}</p>
          <label>
            .p8 key
            <textarea rows={3} spellCheck={false} value={apns.key} onChange={(event) => setApns({ ...apns, key: event.target.value })} />
          </label>
          <label>
            Key id
            <input value={apns.keyId} onChange={(event) => setApns({ ...apns, keyId: event.target.value })} />
          </label>
          <label>
            Team id
            <input value={apns.teamId} onChange={(event) => setApns({ ...apns, teamId: event.target.value })} />
          </label>
          <label>
            Bundle id
            <input value={apns.bundleId} onChange={(event) => setApns({ ...apns, bundleId: event.target.value })} />
          </label>
          <div className="row">
            <button type="button" className="primary" disabled={apns.key.trim() === '' || upload.isPending} onClick={() => upload.mutate('apns')}>
              Save APNs key
            </button>
            {push.data?.apns.configured === true ? (
              <button type="button" onClick={() => remove.mutate('apns')}>
                Delete APNs credentials
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <ErrorNote error={upload.error === null ? (remove.error === null ? null : errorMessage(remove.error)) : errorMessage(upload.error)} />
      <h3>Send a test</h3>
      <form
        className="stack"
        aria-label="Send test push"
        onSubmit={(event) => {
          event.preventDefault();
          test.mutate();
        }}
      >
        <label>
          Platform
          <select value={send.platform} onChange={(event) => setSend({ ...send, platform: event.target.value })}>
            <option value="fcm">FCM</option>
            <option value="apns">APNs</option>
          </select>
        </label>
        <label>
          Device token
          <input value={send.token} onChange={(event) => setSend({ ...send, token: event.target.value })} />
        </label>
        <label>
          Title
          <input value={send.title} onChange={(event) => setSend({ ...send, title: event.target.value })} />
        </label>
        <label>
          Body
          <input value={send.body} onChange={(event) => setSend({ ...send, body: event.target.value })} />
        </label>
        <label>
          Data (JSON) <Hint text="Extra fields for the app. Leave title and body empty for a silent data push." />
          <textarea rows={2} value={send.data} onChange={(event) => setSend({ ...send, data: event.target.value })} />
        </label>
        {send.platform === 'apns' ? (
          <label className="check">
            <input type="checkbox" checked={send.sandbox} onChange={(event) => setSend({ ...send, sandbox: event.target.checked })} />
            Sandbox (development builds)
          </label>
        ) : null}
        <ErrorNote error={problem ?? (test.error === null ? null : errorMessage(test.error))} />
        <button type="submit" className="primary" disabled={send.token.trim() === '' || test.isPending}>
          Send test
        </button>
      </form>
      {result === null ? null : (
        <p role="status" aria-label="Push result">
          {result.ok ? 'Delivered to the provider' : 'Refused'}: status {result.status}
          {result.reason === undefined ? '' : `, ${result.reason}`}
        </p>
      )}
      <h3>History</h3>
      {push.data === undefined || push.data.history.length === 0 ? (
        <EmptyState>No test sent yet.</EmptyState>
      ) : (
        <table className="table" aria-label="Push history">
          <thead>
            <tr>
              <th>Time</th>
              <th>Platform</th>
              <th>Token</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {push.data.history.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.at).toLocaleTimeString()}</td>
                <td>{row.platform}</td>
                <td>
                  <code>{row.token}</code>
                </td>
                <td>{row.ok ? 'ok' : `${String(row.status)} ${row.reason ?? ''}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
