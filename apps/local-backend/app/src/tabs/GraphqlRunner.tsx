import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { AppUser, EndpointDef, HttpReply, UsersPage } from '../api/types';
import { useAdminQuery } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ErrorNote } from '../ui/bits';

const SAMPLE = '{\n  __typename\n}';

/** The body of a GraphQL request, or why the variables are not JSON. */
export function graphqlBody(query: string, variables: string, operationName: string): { ok: true; body: string } | { ok: false; message: string } {
  let parsed: unknown;
  if (variables.trim() !== '') {
    try {
      parsed = JSON.parse(variables) as unknown;
    } catch {
      return { ok: false, message: 'The variables are not valid JSON.' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, message: 'The variables are a JSON object: { "id": 1 }.' };
  }
  return { ok: true, body: JSON.stringify({ query, ...(parsed === undefined ? {} : { variables: parsed }), ...(operationName.trim() === '' ? {} : { operationName: operationName.trim() }) }) };
}

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * A small query runner for a GraphQL endpoint: write a query and variables, optionally sign in as an app user, and run it
 * against the running backend. It is part of the dashboard (no external page or script is loaded). Subscriptions need a
 * WebSocket: use the Live panel to see who is connected, and a client to subscribe.
 */
export function GraphqlRunner({ backend, endpoint, onClose }: { backend: string; endpoint: EndpointDef; onClose: () => void }) {
  const api = useApi();
  const [query, setQuery] = useState(SAMPLE);
  const [variables, setVariables] = useState('');
  const [operationName, setOperationName] = useState('');
  const [token, setToken] = useState('');
  const [reply, setReply] = useState<HttpReply | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const users = useAdminQuery<UsersPage>(backend, '/users?limit=100');
  const list: AppUser[] = users.data?.users ?? [];

  const login = useMutation({
    mutationFn: async (id: string) => (id === '' ? '' : (await adminSend<{ accessToken: string }>(api, backend, 'POST', `/users/${encodeURIComponent(id)}/token`)).accessToken),
    onSuccess: setToken,
  });
  const run = useMutation({
    mutationFn: async () => {
      const made = graphqlBody(query, variables, operationName);
      if (!made.ok) {
        setProblem(made.message);
        return null;
      }
      setProblem(null);
      const headers: [string, string][] = [['content-type', 'application/json']];
      if (token !== '') headers.push(['authorization', `Bearer ${token}`]);
      return api.tryIt(backend, { method: 'POST', path: endpoint.path, headers, body: made.body });
    },
    onSuccess: (answer) => {
      if (answer !== null) setReply(answer);
    },
  });

  return (
    <section className="card try" aria-label="GraphQL query">
      <div className="row">
        <h2>GraphQL: {endpoint.path}</h2>
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted">Runs a real operation against your running backend. Subscriptions need a WebSocket client; they are not run here.</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate();
        }}
      >
        <label>
          Query
          <textarea
            className="code-area"
            rows={8}
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <div className="row">
          <label className="grow">
            Variables (JSON, optional)
            <textarea
              className="code-area"
              rows={3}
              spellCheck={false}
              value={variables}
              onChange={(event) => {
                setVariables(event.target.value);
              }}
            />
          </label>
          <label>
            Operation name (optional)
            <input
              value={operationName}
              onChange={(event) => {
                setOperationName(event.target.value);
              }}
            />
          </label>
        </div>
        <div className="row">
          <label>
            Log in as…
            <select
              onChange={(event) => {
                login.mutate(event.target.value);
              }}
            >
              <option value="">Nobody</option>
              {list.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            Bearer token
            <input
              value={token}
              autoComplete="off"
              onChange={(event) => {
                setToken(event.target.value);
              }}
            />
          </label>
        </div>
        <ErrorNote error={login.error === null ? problem : errorMessage(login.error)} />
        <div className="row">
          <button type="submit" className="primary" disabled={run.isPending}>
            Run
          </button>
        </div>
      </form>
      <ErrorNote error={run.error === null ? null : errorMessage(run.error)} />
      {reply === null ? null : (
        <div className="response" aria-label="Answer">
          <p>
            <strong className={reply.status < 400 ? 'ok' : 'bad'}>{reply.status}</strong> <span className="muted">in {reply.ms} ms</span>
          </p>
          <pre>{pretty(reply.body)}</pre>
        </div>
      )}
    </section>
  );
}
