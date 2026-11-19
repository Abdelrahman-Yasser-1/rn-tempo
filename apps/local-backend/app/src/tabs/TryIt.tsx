import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { AppUser, EndpointDef, HttpMethodName, HttpReply, UsersPage } from '../api/types';
import { useAdminQuery } from '../hooks/lb';
import { METHODS } from '../lib/endpointForm';
import { errorMessage } from '../lib/errors';
import { ErrorNote } from '../ui/bits';

function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Sends one real request to the running backend, with an optional sign-in picked from the app users. */
export function TryIt({ backend, endpoint }: { backend: string; endpoint: EndpointDef | null }) {
  const api = useApi();
  const [method, setMethod] = useState<HttpMethodName>(endpoint?.method ?? 'GET');
  const [path, setPath] = useState(endpoint?.path ?? '/');
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [token, setToken] = useState('');
  const [as, setAs] = useState('');
  const users = useAdminQuery<UsersPage>(backend, '/users?limit=100');
  const [reply, setReply] = useState<HttpReply | null>(null);

  const login = useMutation({
    mutationFn: async (id: string) => {
      if (id === '') return '';
      const answer = await adminSend<{ accessToken: string }>(api, backend, 'POST', `/users/${encodeURIComponent(id)}/token`);
      return answer.accessToken;
    },
    onSuccess: (value) => {
      setToken(value);
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const headers: [string, string][] = [];
      if (body.trim() !== '') headers.push(['content-type', 'application/json']);
      if (token !== '') headers.push(['authorization', `Bearer ${token}`]);
      const suffix = query.trim() === '' ? '' : `?${query.trim().replace(/^\?/, '')}`;
      return api.tryIt(backend, { method, path: `${path}${suffix}`, headers, body: body.trim() === '' ? null : body });
    },
    onSuccess: setReply,
  });
  const list: AppUser[] = users.data?.users ?? [];

  return (
    <section className="card try" aria-label="Try it">
      <h2>Try it</h2>
      <p className="muted">Sends a real request to your running backend, the way the app would.</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate();
        }}
      >
        <div className="row">
          <label>
            Method
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as HttpMethodName);
              }}
            >
              {METHODS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grow">
            Path
            <input
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
              }}
            />
          </label>
        </div>
        <label>
          Query (optional)
          <input
            value={query}
            placeholder="limit=5&q=phone"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <label>
          JSON body (optional)
          <textarea
            className="code-area"
            rows={4}
            spellCheck={false}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
        </label>
        <div className="row">
          <label>
            Log in as…
            <select
              value={as}
              onChange={(event) => {
                setAs(event.target.value);
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
              onChange={(event) => {
                setToken(event.target.value);
              }}
              autoComplete="off"
            />
          </label>
        </div>
        <ErrorNote error={login.error === null ? null : errorMessage(login.error)} />
        <div className="row">
          <button type="submit" className="primary" disabled={send.isPending}>
            Send
          </button>
        </div>
      </form>
      <ErrorNote error={send.error === null ? null : errorMessage(send.error)} />
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
