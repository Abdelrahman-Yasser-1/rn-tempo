import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus, Definition } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { percentToRate, splitList, wholeIn } from '../lib/integrations';
import { ErrorNote, Hint } from '../ui/bits';

interface FaultsDef {
  rateLimit?: { requests: number; perSeconds: number; key: 'ip' | 'user' | 'global' } | null;
  failureRate?: number;
  failureStatus?: number;
  dropRate?: number;
  offline?: boolean;
  slowUpload?: number;
  slowDownload?: number;
}
interface CorsDef {
  origins?: '*' | string[];
  credentials?: boolean;
  maxAge?: number;
}
type AuthMode = 'bearer' | 'cookie' | 'both';

const pct = (rate: number | undefined): string => (rate === undefined ? '' : String(Math.round(rate * 100)));

/** Faults and limits, CORS and the session mode. Test mode turns the faults off unless a request sends x-tempo-test-faults: 1. */
export function SettingsFaults({ backend, definition }: { backend: BackendStatus; definition: Definition }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const faults = (definition.faults ?? {}) as FaultsDef;
  const cors = definition.cors as CorsDef | undefined;
  const stats = useAdminQuery<{ faults?: Record<string, number> }>(backend.path, '/stats', { refetchInterval: 3000 });
  const [limit, setLimit] = useState({ on: faults.rateLimit != null, requests: String(faults.rateLimit?.requests ?? 60), perSeconds: String(faults.rateLimit?.perSeconds ?? 60), key: faults.rateLimit?.key ?? 'ip' });
  const [failure, setFailure] = useState({ rate: pct(faults.failureRate), status: String(faults.failureStatus ?? 500), drop: pct(faults.dropRate), offline: faults.offline === true });
  const [corsForm, setCorsForm] = useState({ on: cors !== undefined, origins: cors?.origins === undefined || cors.origins === '*' ? '*' : cors.origins.join(', '), credentials: cors?.credentials === true, maxAge: String(cors?.maxAge ?? 600) });
  const [mode, setMode] = useState<AuthMode>((definition.auth)?.mode ?? 'bearer');
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const requests = wholeIn(limit.requests, 1, 1_000_000);
      const perSeconds = wholeIn(limit.perSeconds, 1, 86_400);
      const failRate = percentToRate(failure.rate);
      const dropRate = percentToRate(failure.drop);
      const status = wholeIn(failure.status, 400, 599);
      const maxAge = wholeIn(corsForm.maxAge, 0, 86_400);
      const origins = corsForm.origins.trim() === '*' ? '*' : splitList(corsForm.origins);
      const bad = (limit.on && (requests === null || perSeconds === null)) ? 'The rate limit needs whole numbers.' : failRate === null || dropRate === null ? 'Rates are percentages from 0 to 100.' : status === null ? 'The failure status is 400 to 599.' : maxAge === null ? 'Max age is seconds.' : corsForm.on && corsForm.credentials && origins === '*' ? 'Credentials need a list of origins, not "*".' : corsForm.on && origins !== '*' && origins.length === 0 ? 'List at least one origin, or *.' : null;
      if (bad !== null) {
        setProblem(bad);
        return false;
      }
      setProblem(null);
      const faultsOut: FaultsDef = { ...(limit.on ? { rateLimit: { requests: requests ?? 60, perSeconds: perSeconds ?? 60, key: limit.key } } : {}), ...((failRate ?? 0) > 0 ? { failureRate: failRate ?? 0, failureStatus: status ?? 500 } : {}), ...((dropRate ?? 0) > 0 ? { dropRate: dropRate ?? 0 } : {}), ...(failure.offline ? { offline: true } : {}) };
      await adminSend(api, backend.path, 'PUT', '/settings/faults', {
        ...(Object.keys(faultsOut).length === 0 ? {} : { faults: faultsOut }),
        ...(corsForm.on ? { cors: { origins, credentials: corsForm.credentials, maxAge } } : {}),
      });
      return true;
    },
    onSuccess: async (saved) => {
      if (saved) await refresh();
    },
  });
  const saveMode = useMutation({
    mutationFn: () => adminSend(api, backend.path, 'PUT', '/definition', { ...definition, auth: { ...definition.auth, ...(mode === 'bearer' ? { mode: undefined } : { mode }) } }),
    onSuccess: refresh,
  });
  const counts = stats.data?.faults;

  return (
    <section className="card" aria-label="Faults and limits">
      <h2>Faults, CORS and sessions</h2>
      <p className="muted">
        Make the backend misbehave on purpose. In test mode all of this is off unless a request sends <code>x-tempo-test-faults: 1</code>. Random choices repeat for the same request number.
      </p>
      <form
        className="stack"
        aria-label="Faults form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="check">
          <input type="checkbox" checked={limit.on} onChange={(event) => setLimit({ ...limit, on: event.target.checked })} />
          Rate limit
        </label>
        {limit.on ? (
          <div className="row">
            <label>
              Requests
              <input value={limit.requests} onChange={(event) => setLimit({ ...limit, requests: event.target.value })} />
            </label>
            <label>
              Per seconds
              <input value={limit.perSeconds} onChange={(event) => setLimit({ ...limit, perSeconds: event.target.value })} />
            </label>
            <label>
              Counted by
              <select value={limit.key} onChange={(event) => setLimit({ ...limit, key: event.target.value as 'ip' | 'user' | 'global' })}>
                <option value="ip">Client address</option>
                <option value="user">Signed-in user</option>
                <option value="global">Everybody together</option>
              </select>
            </label>
          </div>
        ) : null}
        <div className="row">
          <label>
            Failure rate (%)
            <input value={failure.rate} onChange={(event) => setFailure({ ...failure, rate: event.target.value })} />
          </label>
          <label>
            Failure status
            <input value={failure.status} onChange={(event) => setFailure({ ...failure, status: event.target.value })} />
          </label>
          <label>
            Dropped connections (%)
            <input value={failure.drop} onChange={(event) => setFailure({ ...failure, drop: event.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={failure.offline} onChange={(event) => setFailure({ ...failure, offline: event.target.checked })} />
          Offline (refuse every connection) <Hint text="Closes each connection at once, as if there were no network." />
        </label>
        <label className="check">
          <input type="checkbox" checked={corsForm.on} onChange={(event) => setCorsForm({ ...corsForm, on: event.target.checked })} />
          Send CORS headers
        </label>
        {corsForm.on ? (
          <div className="row">
            <label>
              Allowed origins
              <input value={corsForm.origins} onChange={(event) => setCorsForm({ ...corsForm, origins: event.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={corsForm.credentials} onChange={(event) => setCorsForm({ ...corsForm, credentials: event.target.checked })} />
              Allow credentials
            </label>
            <label>
              Max age (s)
              <input value={corsForm.maxAge} onChange={(event) => setCorsForm({ ...corsForm, maxAge: event.target.value })} />
            </label>
          </div>
        ) : null}
        <ErrorNote error={problem ?? (save.error === null ? null : errorMessage(save.error))} />
        <div className="row">
          <button type="submit" className="primary" disabled={save.isPending}>
            Save faults and CORS
          </button>
          {save.isSuccess && save.data ? <span className="ok" role="status">Saved. It applies to the next request.</span> : null}
        </div>
      </form>
      {counts === undefined ? null : (
        <p className="muted" aria-label="Fault counts">
          Since the backend started: {counts.rateLimited ?? 0} rate limited, {counts.failed ?? 0} failed, {counts.dropped ?? 0} dropped, {counts.offline ?? 0} refused offline.
        </p>
      )}
      <h3>Session mode</h3>
      <form
        className="row"
        aria-label="Session mode form"
        onSubmit={(event) => {
          event.preventDefault();
          saveMode.mutate();
        }}
      >
        <label>
          Sign-in mode
          <select value={mode} onChange={(event) => setMode(event.target.value as AuthMode)}>
            <option value="bearer">Bearer tokens (default)</option>
            <option value="cookie">HttpOnly session cookie</option>
            <option value="both">Both</option>
          </select>
        </label>
        <button type="submit" disabled={saveMode.isPending}>
          Save session mode
        </button>
      </form>
      {mode === 'bearer' ? null : <p className="muted">Cookie sessions use SameSite=Lax. A browser page must send the CSRF token from the login in the x-tempo-csrf header (or come from an allowed origin).</p>}
      <ErrorNote error={saveMode.error === null ? null : errorMessage(saveMode.error)} />
    </section>
  );
}
