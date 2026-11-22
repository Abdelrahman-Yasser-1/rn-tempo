import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { Definition, EndpointDef, Scenarios } from '../api/types';
import { useAdminQuery, useRefresh } from '../hooks/lb';
import { ENDPOINT_TYPES } from '../lib/endpointForm';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorNote } from '../ui/bits';

import { EndpointDetail, hasDetail } from './EndpointDetail';
import { EndpointDialog } from './EndpointDialog';
import { ImportDialog } from './ImportDialog';
import { LivePanel } from './LivePanel';
import { TryIt } from './TryIt';
import { Write } from '../hooks/team';

const typeLabel = (type: EndpointDef['type']): string => ENDPOINT_TYPES.find((item) => item.value === type)?.label.split(' (')[0] ?? type;

/** Endpoints that hold connections open: they get a Live panel instead of Try it. */
const isLive = (endpoint: EndpointDef): boolean => endpoint.type === 'sse';

type Dialog = { kind: 'add' } | { kind: 'edit'; endpoint: EndpointDef } | { kind: 'copy'; endpoint: EndpointDef };

function ScenarioPicker({ backend, endpoint, scenarios }: { backend: string; endpoint: EndpointDef; scenarios: Scenarios }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const names = scenarios.endpoints.find((item) => item.id === endpoint.id)?.scenarios ?? [];
  const active = scenarios.active[endpoint.id] ?? '';
  const pick = useMutation({
    mutationFn: (name: string) =>
      name === '' ? adminSend(api, backend, 'DELETE', `/scenarios/${encodeURIComponent(endpoint.id)}`) : adminSend(api, backend, 'PUT', `/scenarios/${encodeURIComponent(endpoint.id)}`, { name }),
    onSettled: refresh,
  });
  return (
    <>
      <select
        className={active === '' ? 'scenario' : 'scenario active'}
        aria-label={`Scenario for ${endpoint.method} ${endpoint.path}`}
        value={active}
        onChange={(event) => {
          pick.mutate(event.target.value);
        }}
      >
        <option value="">Normal answer</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {pick.error === null ? null : <span className="error">{errorMessage(pick.error)}</span>}
    </>
  );
}

/** The endpoints of a backend: add, edit, duplicate, delete, pick a scenario, and try one. */
export function Endpoints({ backend }: { backend: string }) {
  const api = useApi();
  const refresh = useRefresh(backend);
  const definition = useAdminQuery<Definition>(backend, '/definition');
  const scenarios = useAdminQuery<Scenarios>(backend, '/scenarios');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [deleting, setDeleting] = useState<EndpointDef | null>(null);
  const [trying, setTrying] = useState<EndpointDef | null>(null);
  const [live, setLive] = useState<EndpointDef | null>(null);
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<EndpointDef | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: (endpoint: EndpointDef) => adminSend(api, backend, 'DELETE', `/endpoints/${encodeURIComponent(endpoint.id)}`),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });

  if (definition.isError) return <ErrorNote error={definition.error} />;
  if (definition.data === undefined) return <p className="muted">Loading the endpoints…</p>;
  const endpoints = definition.data.endpoints ?? [];
  const collections = definition.data.collections ?? [];
  const ids = new Set(endpoints.map((endpoint) => endpoint.id));

  return (
    <div className="screen">
      <div className="row">
        <h2>Endpoints</h2>
        <span className="spacer" />
        <Write><button
          type="button"
          onClick={() => {
            setImporting(true);
          }}
        >
          Import API file…
        </button></Write>
        <Write><button
          type="button"
          className="primary"
          onClick={() => {
            setDialog({ kind: 'add' });
          }}
        >
          Add endpoint
        </button></Write>
      </div>
      {imported === null ? null : (
        <p className="ok" role="status">
          {imported}
        </p>
      )}
      {endpoints.length === 0 ? (
        <EmptyState>No endpoints yet. Choose Add endpoint to make the first one, or Import API file to make them from an OpenAPI or Swagger file.</EmptyState>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Method</th>
              <th>Path</th>
              <th>Type</th>
              <th>Sign-in</th>
              <th>What it does</th>
              <th>Scenario</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((endpoint) => (
              <tr key={endpoint.id} className={trying?.id === endpoint.id ? 'selected' : ''}>
                <td>
                  <span className={`method ${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                </td>
                <td>
                  <code>{endpoint.path}</code>
                </td>
                <td>{typeLabel(endpoint.type)}</td>
                <td>{endpoint.auth === 'bearer' ? 'Needed' : '–'}</td>
                <td className="summary">{endpoint.summary ?? ''}</td>
                <td>{scenarios.data === undefined ? null : <Write><ScenarioPicker backend={backend} endpoint={endpoint} scenarios={scenarios.data} /></Write>}</td>
                <td className="actions-cell">
                  {isLive(endpoint) ? (
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Live ${endpoint.path}`}
                      onClick={() => {
                        setLive(endpoint);
                      }}
                    >
                      Live
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Try ${endpoint.method} ${endpoint.path}`}
                      onClick={() => {
                        setTrying(endpoint);
                      }}
                    >
                      Try
                    </button>
                  )}
                  {hasDetail(endpoint) ? (
                    <button
                      type="button"
                      className="ghost"
                      aria-label={`Details of ${endpoint.method} ${endpoint.path}`}
                      onClick={() => {
                        setDetail(endpoint);
                      }}
                    >
                      Details
                    </button>
                  ) : null}
                  <Write><button
                    type="button"
                    className="ghost"
                    aria-label={`Edit ${endpoint.method} ${endpoint.path}`}
                    onClick={() => {
                      setDialog({ kind: 'edit', endpoint });
                    }}
                  >
                    Edit
                  </button></Write>
                  <Write><button
                    type="button"
                    className="ghost"
                    aria-label={`Duplicate ${endpoint.method} ${endpoint.path}`}
                    onClick={() => {
                      setDialog({ kind: 'copy', endpoint });
                    }}
                  >
                    Duplicate
                  </button></Write>
                  <Write><button
                    type="button"
                    className="ghost bad"
                    aria-label={`Delete ${endpoint.method} ${endpoint.path}`}
                    onClick={() => {
                      setDeleting(endpoint);
                    }}
                  >
                    Delete
                  </button></Write>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {live === null ? null : (
        <LivePanel
          key={live.id}
          backend={backend}
          endpoint={live}
          onClose={() => {
            setLive(null);
          }}
        />
      )}
      <TryIt key={trying?.id ?? 'none'} backend={backend} endpoint={trying} />
      {dialog === null ? null : (
        <EndpointDialog
          backend={backend}
          collections={collections}
          existingIds={ids}
          templates={definition.data.responseTemplates ?? {}}
          {...(dialog.kind === 'add' ? {} : { endpoint: dialog.endpoint, copy: dialog.kind === 'copy' })}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={() => {
            setDialog(null);
            void refresh();
          }}
        />
      )}
      {importing ? (
        <ImportDialog
          backend={backend}
          onClose={() => {
            setImporting(false);
          }}
          onDone={(result) => {
            setImporting(false);
            const { added, removed, taken, merged } = result.applied;
            setImported(`Imported: ${String(added.length)} added, ${String(taken.length + merged.length)} changed, ${String(removed.length)} removed.`);
            void refresh();
          }}
        />
      ) : null}
      {detail === null ? null : (
        <EndpointDetail
          endpoint={detail}
          onClose={() => {
            setDetail(null);
          }}
        />
      )}
      {deleting === null ? null : (
        <ConfirmDialog
          title="Delete this endpoint?"
          confirmLabel="Delete endpoint"
          busy={remove.isPending}
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            remove.mutate(deleting);
          }}
        >
          <p>
            <strong>
              {deleting.method} {deleting.path}
            </strong>{' '}
            stops answering, and its scenarios are removed. Your data is not touched.
          </p>
          <ErrorNote error={remove.error === null ? null : errorMessage(remove.error)} />
        </ConfirmDialog>
      )}
    </div>
  );
}
