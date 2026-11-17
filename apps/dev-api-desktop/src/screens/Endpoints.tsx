import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useClient } from '../client/context';
import type { EndpointSummary, HttpReply, ProjectInfo } from '../client/types';
import { keys, useEndpoints, useProjectState } from '../hooks/queries';
import {
  accessTokenFrom,
  buildTryRequest,
  findLoginEndpoint,
  groupEndpoints,
  MOCK_LOGIN_BODY,
  pathParams,
  prettyBody,
} from '../lib/endpoints';
import { errorMessage } from '../lib/errors';
import { controlJson, jsonHeaders } from '../lib/server';

const DEFAULT = '';

interface Health {
  scenarios: Record<string, string>;
}

function useActiveScenarios(project: string, pid: number | null) {
  const client = useClient();
  return useQuery({
    queryKey: ['scenarios', project, pid],
    enabled: pid !== null,
    queryFn: () => controlJson<Health>(client, project, { method: 'GET', path: '/__tempo/health' }),
    refetchInterval: 3000,
  });
}

function ScenarioPicker({
  endpoint,
  active,
  onChange,
  disabled,
}: {
  endpoint: EndpointSummary;
  active: string;
  onChange: (name: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      aria-label={`Scenario for ${endpoint.method} ${endpoint.path}`}
      value={active}
      disabled={disabled}
      className={active === DEFAULT ? 'scenario' : 'scenario active'}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
    >
      <option value={DEFAULT}>default</option>
      {endpoint.scenarios.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function TryIt({ project, endpoint, all }: { project: string; endpoint: EndpointSummary; all: EndpointSummary[] }) {
  const client = useClient();
  const names = pathParams(endpoint.path);
  const [params, setParams] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [body, setBody] = useState('');
  const [token, setToken] = useState('');
  const [reply, setReply] = useState<HttpReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = findLoginEndpoint(all);
  const hasBody = endpoint.method !== 'GET';

  const send = async () => {
    const built = buildTryRequest({ endpoint, params, query, body, token });
    if ('error' in built) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setReply(await client.control(project, built.request));
    } catch (failure) {
      setReply(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const mockLogin = async () => {
    if (login === undefined) return;
    setError(null);
    try {
      const result = await client.control(project, { method: 'POST', path: login.path, headers: jsonHeaders, body: MOCK_LOGIN_BODY });
      const accessToken = accessTokenFrom(result.body);
      if (accessToken === null) setError(`Mock login answered ${result.status} without a token.`);
      else setToken(accessToken);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <section className="card try" aria-label="Try it">
      <h2>
        Try it: <code>{endpoint.method}</code> <code>{endpoint.path}</code>
      </h2>
      {names.map((name) => (
        <label key={name}>
          {name} (path)
          <input value={params[name] ?? ''} onChange={(event) => setParams({ ...params, [name]: event.target.value })} />
        </label>
      ))}
      <label>
        Query string
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="limit=10&skip=0" />
      </label>
      {hasBody && (
        <label>
          JSON body
          <textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} />
        </label>
      )}
      <div className="row">
        <label className="grow">
          Bearer token
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder={endpoint.auth === null ? 'not needed' : 'required'} />
        </label>
        <button type="button" onClick={() => void mockLogin()} disabled={login === undefined} title={login === undefined ? 'This API has no /auth/login endpoint.' : undefined}>
          Mock login
        </button>
      </div>
      <div className="row">
        <button type="button" className="primary" onClick={() => void send()} disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {reply !== null && (
        <div className="response" aria-label="Response">
          <p>
            <strong className={reply.status < 400 ? 'ok' : 'bad'}>{reply.status}</strong> <span className="muted">{reply.ms} ms</span>
          </p>
          <pre>{prettyBody(reply.body)}</pre>
        </div>
      )}
    </section>
  );
}

export function Endpoints({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const state = useProjectState(project.path);
  const pid = state.data?.running === true ? state.data.pid : null;
  const endpoints = useEndpoints(project.path, pid);
  const scenarios = useActiveScenarios(project.path, pid);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => groupEndpoints(endpoints.data ?? [], query), [endpoints.data, query]);
  const current = endpoints.data?.find((endpoint) => endpoint.id === selected);

  const choose = async (endpoint: EndpointSummary, name: string) => {
    setError(null);
    try {
      await controlJson(
        client,
        project.path,
        name === DEFAULT
          ? { method: 'POST', path: '/__tempo/scenario', headers: jsonHeaders, body: JSON.stringify({ clear: true, endpointId: endpoint.id }) }
          : { method: 'POST', path: '/__tempo/scenario', headers: jsonHeaders, body: JSON.stringify({ endpointId: endpoint.id, name }) },
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
    await queryClient.invalidateQueries({ queryKey: ['scenarios', project.path] });
    await queryClient.invalidateQueries({ queryKey: keys.state(project.path) });
  };

  if (pid === null) return <p className="muted">Start the server on the Overview tab to see its endpoints.</p>;
  if (endpoints.isPending) return <p className="muted">Loading endpoints…</p>;
  if (endpoints.isError) {
    return (
      <p className="error" role="alert">
        {endpoints.error.message}
      </p>
    );
  }

  return (
    <div className="screen endpoints">
      <div className="row">
        <input type="search" aria-label="Search endpoints" placeholder="Search method, path, tag…" value={query} onChange={(event) => setQuery(event.target.value)} className="grow" />
        <span className="muted">{endpoints.data.length} endpoints</span>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="split">
        <div className="list" role="list" aria-label="Endpoints">
          {groups.length === 0 && <p className="muted">Nothing matches.</p>}
          {groups.map((group) => (
            <section key={group.tag} aria-label={group.tag}>
              <h3>{group.tag}</h3>
              {group.items.map((endpoint) => (
                <div
                  key={endpoint.id}
                  role="listitem"
                  className={endpoint.id === selected ? 'endpoint selected' : 'endpoint'}
                >
                  <button type="button" className="endpoint-main" onClick={() => setSelected(endpoint.id)} aria-pressed={endpoint.id === selected}>
                    <span className={`method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                    <span className="endpoint-path">{endpoint.path}</span>
                    {endpoint.summary !== null && <span className="muted summary">{endpoint.summary}</span>}
                  </button>
                  <ScenarioPicker
                    endpoint={endpoint}
                    active={scenarios.data?.scenarios[endpoint.id] ?? DEFAULT}
                    disabled={scenarios.isPending}
                    onChange={(name) => void choose(endpoint, name)}
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
        {current === undefined ? (
          <p className="muted">Pick an endpoint to try it.</p>
        ) : (
          <TryIt key={current.id} project={project.path} endpoint={current} all={endpoints.data} />
        )}
      </div>
    </div>
  );
}
