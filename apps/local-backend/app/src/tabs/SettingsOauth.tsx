import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { appAuthSnippet, splitList } from '../lib/integrations';
import { CopyButton } from '../ui/CopyButton';
import { ErrorNote, Hint } from '../ui/bits';

interface OauthView {
  enabled: boolean;
  provider: string;
  clients: { clientId: string; name?: string; redirectUris: string[]; secretConfigured: boolean }[];
  endpoints: { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; userinfoEndpoint: string; jwksUri: string; discovery: string };
}

/** The mock OAuth 2.0 / OpenID Connect provider: who may sign in with it, and the addresses to paste into an app. */
export function SettingsOauth({ backend }: { backend: BackendStatus }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const view = useAdminQuery<OauthView>(backend.path, '/oauth');
  const [draft, setDraft] = useState<{ enabled: boolean; provider: string; clients: { clientId: string; redirects: string }[] } | null>(null);
  const [secret, setSecret] = useState<{ clientId: string; value: string } | null>(null);
  const data = view.data;
  const form = draft ?? (data === undefined ? null : { enabled: data.enabled, provider: data.provider, clients: data.clients.map((client) => ({ clientId: client.clientId, redirects: client.redirectUris.join('\n') })) });

  const save = useMutation({
    mutationFn: () => {
      if (form === null) return Promise.resolve();
      return adminSend(api, backend.path, 'PUT', '/oauth', { enabled: form.enabled, provider: form.provider, clients: form.clients.map((client) => ({ clientId: client.clientId.trim(), redirectUris: splitList(client.redirects) })) });
    },
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });
  const makeSecret = useMutation({
    mutationFn: async (clientId: string) => setSecret({ clientId, value: (await adminSend<{ secret: string }>(api, backend.path, 'POST', `/oauth/clients/${encodeURIComponent(clientId)}/secret`)).secret }),
    onSuccess: refresh,
  });
  const dropSecret = useMutation({ mutationFn: (clientId: string) => adminSend(api, backend.path, 'DELETE', `/oauth/clients/${encodeURIComponent(clientId)}/secret`), onSuccess: refresh });
  if (form === null || data === undefined) return <section className="card" aria-label="OAuth"><h2>OAuth sign-in mock</h2>{view.isError ? <ErrorNote error={view.error} /> : <p className="muted">Loading…</p>}</section>;
  const change = (next: typeof form): void => setDraft(next);
  const first = data.clients[0];

  return (
    <section className="card" aria-label="OAuth">
      <h2>OAuth sign-in mock</h2>
      <p className="muted">Sign in with Google, Apple or GitHub style buttons against this backend&apos;s app users (authorization code with PKCE). It issues this backend&apos;s own tokens.</p>
      <form
        className="stack"
        aria-label="OAuth form"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="check">
          <input type="checkbox" checked={form.enabled} onChange={(event) => change({ ...form, enabled: event.target.checked })} />
          Enable the OAuth mock
        </label>
        <label>
          Look like <Hint text="Picks the claim names of the ID token and userinfo." />
          <select value={form.provider} onChange={(event) => change({ ...form, provider: event.target.value })}>
            <option value="google">Google</option>
            <option value="apple">Apple</option>
            <option value="github">GitHub</option>
            <option value="generic">Generic</option>
          </select>
        </label>
        {form.clients.map((client, index) => (
          <fieldset key={index} className="stack">
            <legend>Client {index + 1}</legend>
            <label>
              Client id
              <input value={client.clientId} onChange={(event) => change({ ...form, clients: form.clients.map((item, at) => (at === index ? { ...item, clientId: event.target.value } : item)) })} />
            </label>
            <label>
              Redirect URIs (one per line, exact match)
              <textarea rows={2} value={client.redirects} onChange={(event) => change({ ...form, clients: form.clients.map((item, at) => (at === index ? { ...item, redirects: event.target.value } : item)) })} />
            </label>
            <div className="row">
              <button type="button" onClick={() => change({ ...form, clients: form.clients.filter((_item, at) => at !== index) })}>
                Remove client {index + 1}
              </button>
              {data.clients.find((saved) => saved.clientId === client.clientId) === undefined ? null : (
                <>
                  <button type="button" onClick={() => makeSecret.mutate(client.clientId)}>
                    {data.clients.find((saved) => saved.clientId === client.clientId)?.secretConfigured === true ? 'Make a new secret' : 'Make a client secret'} for {client.clientId}
                  </button>
                  {data.clients.find((saved) => saved.clientId === client.clientId)?.secretConfigured === true ? (
                    <button type="button" onClick={() => dropSecret.mutate(client.clientId)}>
                      Remove the secret of {client.clientId}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={() => change({ ...form, clients: [...form.clients, { clientId: '', redirects: '' }] })}>
          Add client
        </button>
        <ErrorNote error={save.error === null ? (makeSecret.error === null ? null : errorMessage(makeSecret.error)) : errorMessage(save.error)} />
        <button type="submit" className="primary" disabled={save.isPending}>
          Save OAuth settings
        </button>
      </form>
      {secret === null ? null : (
        <div className="notice" role="status">
          Client secret of <strong>{secret.clientId}</strong> (shown once): <code>{secret.value}</code> <CopyButton text={secret.value} label="Copy client secret" />
        </div>
      )}
      <h3>Addresses to paste into your app</h3>
      <dl aria-label="OAuth addresses">
        {(
          [
            ['Issuer', data.endpoints.issuer],
            ['Authorization endpoint', data.endpoints.authorizationEndpoint],
            ['Token endpoint', data.endpoints.tokenEndpoint],
            ['Userinfo endpoint', data.endpoints.userinfoEndpoint],
            ['JWKS', data.endpoints.jwksUri],
            ['Discovery', data.endpoints.discovery],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <code>{value}</code> <CopyButton text={value} />
            </dd>
          </div>
        ))}
      </dl>
      {first === undefined ? null : (
        <>
          <h3>react-native-app-auth</h3>
          <pre className="code-area">{appAuthSnippet(data.endpoints, first.clientId, first.redirectUris[0] ?? '')}</pre>
        </>
      )}
    </section>
  );
}
