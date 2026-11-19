import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus, CertInfo, Definition } from '../api/types';
import { keys, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ErrorNote, Hint } from '../ui/bits';

const whole = (text: string, min: number, max: number): number | null => (/^\d{1,7}$/.test(text) && Number(text) >= min && Number(text) <= max ? Number(text) : null);

/** Port, HTTPS, token lifetimes and the media size limit. They are saved into backend.json through the engine. */
export function SettingsServer({ backend, definition, certs }: { backend: BackendStatus; definition: Definition; certs: CertInfo | undefined }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = useRefresh(backend.path);
  const [port, setPort] = useState(String(definition.port ?? 8443));
  const [https, setHttps] = useState(definition.https ?? true);
  const [access, setAccess] = useState(String(definition.auth?.accessTtlMin ?? 30));
  const [refreshDays, setRefreshDays] = useState(String(definition.auth?.refreshTtlDays ?? 30));
  const [maxMb, setMaxMb] = useState(String(Math.round((definition.media?.maxBytes ?? 104_857_600) / 1024 / 1024)));
  const [restart, setRestart] = useState(false);
  const [publicAccess, setPublicAccess] = useState<'open' | 'key'>(definition.publicAccess ?? 'open');

  const values = { port: whole(port, 1, 65535), access: whole(access, 1, 525_600), refresh: whole(refreshDays, 1, 3650), mb: whole(maxMb, 1, 100_000) };
  const valid = Object.values(values).every((value) => value !== null);

  const save = useMutation({
    mutationFn: async () => {
      const next: Definition = {
        ...definition,
        port: values.port ?? 8443,
        https,
        ...(api.team === null ? {} : { publicAccess }),
        auth: { ...definition.auth, accessTtlMin: values.access ?? 30, refreshTtlDays: values.refresh ?? 30 },
        media: { ...definition.media, maxBytes: (values.mb ?? 100) * 1024 * 1024 },
      };
      // The engine hot-reloads token lifetimes and the media limit; the port and HTTPS apply at the next start.
      await adminSend(api, backend.path, 'PUT', '/definition', next);
      return (definition.port ?? 8443) !== next.port || (definition.https ?? true) !== https;
    },
    onSuccess: async (needsRestart) => {
      setRestart(needsRestart);
      await refresh();
    },
  });
  const restartNow = useMutation({
    mutationFn: async () => {
      await api.stopBackend(backend.path);
      return api.startBackend(backend.path, null);
    },
    onSettled: async () => {
      setRestart(false);
      await queryClient.invalidateQueries({ queryKey: keys.backends });
      await refresh();
    },
  });

  return (
    <section className="card" aria-label="Server">
      <h2>Server</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="row">
          <label>
            Port
            <input className="short" inputMode="numeric" value={port} aria-invalid={values.port === null} onChange={(event) => { setPort(event.target.value); }} />
          </label>
          <label className="check">
            <input type="checkbox" checked={https} onChange={(event) => { setHttps(event.target.checked); }} />
            Use HTTPS <Hint text="HTTPS needs a certificate (see Certificates below). Phones and simulators only accept it when they trust that certificate." />
          </label>
        </div>
        {https && certs !== undefined && !certs.hasCert ? <p className="warning">There is no certificate yet, so the backend will serve plain HTTP. Create one below.</p> : null}
        <div className="row">
          <label>
            Access token lifetime (minutes)
            <input className="short" inputMode="numeric" value={access} aria-invalid={values.access === null} onChange={(event) => { setAccess(event.target.value); }} />
          </label>
          <label>
            Refresh token lifetime (days)
            <input className="short" inputMode="numeric" value={refreshDays} aria-invalid={values.refresh === null} onChange={(event) => { setRefreshDays(event.target.value); }} />
          </label>
          <label>
            Largest media file (MB)
            <input className="short" inputMode="numeric" value={maxMb} aria-invalid={values.mb === null} onChange={(event) => { setMaxMb(event.target.value); }} />
          </label>
        </div>
        {api.team === null ? null : (
          <div className="row">
            <label>
              Public API access <Hint text="Open: anyone who can reach the server can call this backend's public API. Key: every request needs an x-tempo-access-key header with a key of scope public (make one under Team, API keys)." />
              <select value={publicAccess} onChange={(event) => { setPublicAccess(event.target.value as 'open' | 'key'); }}>
                <option value="open">Open</option>
                <option value="key">Needs an access key</option>
              </select>
            </label>
          </div>
        )}
        <ErrorNote error={save.error === null ? null : errorMessage(save.error)} />
        <div className="row">
          <button type="submit" className="primary" disabled={!valid || save.isPending}>
            Save settings
          </button>
          {save.isSuccess && !restart ? <span className="ok" role="status">Saved. The app sees it on its next request.</span> : null}
        </div>
      </form>
      {restart ? (
        <div className="row" role="status">
          <span>The port or HTTPS changed. Restart the backend to use it.</span>
          <button type="button" className="primary" disabled={restartNow.isPending} onClick={() => { restartNow.mutate(); }}>
            Restart now
          </button>
        </div>
      ) : null}
      <ErrorNote error={restartNow.error === null ? null : errorMessage(restartNow.error)} />
    </section>
  );
}
