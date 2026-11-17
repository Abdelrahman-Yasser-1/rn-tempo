import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useClient } from '../client/context';
import type { CliOutput, ProjectInfo } from '../client/types';
import { Output } from '../components/Output';
import { errorMessage } from '../lib/errors';
import {
  buildWorkspace,
  emptyEndpoint,
  emptyScenario,
  METHODS,
  parseDraft,
  serializeWorkspace,
  type Draft,
  type EndpointDraft,
  type ScenarioDraft,
} from '../lib/workspace';

function ScenarioRow({ scenario, onChange, onRemove }: { scenario: ScenarioDraft; onChange: (next: ScenarioDraft) => void; onRemove: () => void }) {
  return (
    <fieldset className="scenario-row">
      <legend>Scenario {scenario.name}</legend>
      <div className="row">
        <label>
          Name
          <input value={scenario.name} onChange={(event) => onChange({ ...scenario, name: event.target.value })} />
        </label>
        <label>
          Status
          <input value={scenario.status} inputMode="numeric" className="short" onChange={(event) => onChange({ ...scenario, status: event.target.value })} />
        </label>
        <label>
          Delay (ms)
          <input value={scenario.delayMs} inputMode="numeric" className="short" onChange={(event) => onChange({ ...scenario, delayMs: event.target.value })} />
        </label>
        <button type="button" className="ghost" onClick={onRemove} aria-label={`Remove scenario ${scenario.name}`}>
          Remove
        </button>
      </div>
      <label>
        Body (JSON, optional)
        <textarea rows={3} value={scenario.body} spellCheck={false} onChange={(event) => onChange({ ...scenario, body: event.target.value })} />
      </label>
    </fieldset>
  );
}

function EndpointForm({ endpoint, onChange, onRemove }: { endpoint: EndpointDraft; onChange: (next: EndpointDraft) => void; onRemove: () => void }) {
  const set = (patch: Partial<EndpointDraft>) => onChange({ ...endpoint, ...patch });
  return (
    <section className="card" aria-label="Endpoint">
      <div className="row">
        <label>
          Method
          <select value={endpoint.method} onChange={(event) => set({ method: event.target.value })}>
            {METHODS.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          Path
          <input value={endpoint.path} onChange={(event) => set({ path: event.target.value })} placeholder="/products/:id" />
        </label>
        <label>
          Status
          <input value={endpoint.status} inputMode="numeric" className="short" onChange={(event) => set({ status: event.target.value })} />
        </label>
      </div>
      <label>
        Id
        <input value={endpoint.id} onChange={(event) => set({ id: event.target.value })} />
      </label>
      <div className="row">
        <label className="grow">
          Summary
          <input value={endpoint.summary} onChange={(event) => set({ summary: event.target.value })} />
        </label>
        <label className="grow">
          Tags (comma separated)
          <input value={endpoint.tags} onChange={(event) => set({ tags: event.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={endpoint.bearer} onChange={(event) => set({ bearer: event.target.checked })} /> Needs a bearer token
        </label>
      </div>
      <label>
        Example response (JSON). Leave empty to generate data from the response schema.
        <textarea rows={8} value={endpoint.example} spellCheck={false} onChange={(event) => set({ example: event.target.value })} />
      </label>
      <h3>Scenarios</h3>
      {endpoint.scenarios.map((scenario, index) => (
        <ScenarioRow
          key={index}
          scenario={scenario}
          onChange={(next) => set({ scenarios: endpoint.scenarios.map((item, at) => (at === index ? next : item)) })}
          onRemove={() => set({ scenarios: endpoint.scenarios.filter((_item, at) => at !== index) })}
        />
      ))}
      <div className="row">
        <button type="button" onClick={() => set({ scenarios: [...endpoint.scenarios, emptyScenario(endpoint.scenarios.length + 1)] })}>
          Add scenario
        </button>
        <span className="spacer" />
        <button type="button" className="ghost bad" onClick={onRemove}>
          Delete endpoint
        </button>
      </div>
    </section>
  );
}

export function WorkspaceEditor({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const file = useQuery({ queryKey: ['workspace', project.path], queryFn: () => client.readWorkspace(project.path), staleTime: Infinity });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [output, setOutput] = useState<CliOutput | null>(null);
  const [exportTarget, setExportTarget] = useState<string | null>(null);

  // Load (or reload after an import) when the file text changes. Done while rendering, as React advises
  // for state that follows a query, so there is no effect and no extra render pass.
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  if (file.data !== undefined && file.data !== loadedFrom) {
    setLoadedFrom(file.data);
    try {
      setDraft(parseDraft(file.data));
      setErrors([]);
    } catch (failure) {
      setDraft(null);
      setErrors([errorMessage(failure)]);
    }
    setDirty(false);
  }

  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    if (draft === null) return;
    const built = buildWorkspace(draft);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setErrors([]);
    try {
      await client.writeWorkspace(project.path, serializeWorkspace(built.workspace));
      setDirty(false);
      setMessage('Saved. Restart the server to serve the changes.');
      await queryClient.invalidateQueries({ queryKey: ['workspace', project.path] });
    } catch (failure) {
      setErrors([errorMessage(failure)]);
    }
  };

  const runCli = async (action: Parameters<typeof client.cli>[1]) => {
    setErrors([]);
    try {
      const result = await client.cli(project.path, action);
      setOutput(result);
      return result;
    } catch (failure) {
      setErrors([errorMessage(failure)]);
      return null;
    }
  };

  const importOpenApi = async () => {
    const chosen = await client.pickFile('Choose an OpenAPI file', ['json', 'yaml', 'yml']);
    if (chosen === null) return;
    const result = await runCli({ kind: 'importOpenapi', file: chosen });
    if (result?.code === 0) {
      setSelected(0);
      await queryClient.invalidateQueries({ queryKey: ['workspace', project.path] });
      await file.refetch();
    }
  };

  const exportCode = async (force: boolean) => {
    const target = force ? exportTarget : await client.pickFolder('Choose the project to export into');
    if (target === null) return;
    setExportTarget(target);
    const result = await runCli({ kind: 'exportCode', out: target, force });
    if (result?.code === 0) setExportTarget(null);
  };

  if (file.isPending) return <p className="muted">Loading the workspace…</p>;
  if (file.isError) {
    return (
      <p className="error" role="alert">
        {errorMessage(file.error)}
      </p>
    );
  }
  if (draft === null) {
    return (
      <p className="error" role="alert">
        {errors[0] ?? 'The workspace could not be read.'}
      </p>
    );
  }

  const endpoint = draft.endpoints[selected];
  return (
    <div className="screen workspace">
      <section className="card" aria-label="Workspace">
        <div className="row">
          <label className="grow">
            Name
            <input value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} />
          </label>
          <label>
            Base path
            <input value={draft.basePath} onChange={(event) => change({ ...draft, basePath: event.target.value })} placeholder="/api/v1" />
          </label>
          <label>
            Port
            <input value={draft.port} inputMode="numeric" className="short" onChange={(event) => change({ ...draft, port: event.target.value })} />
          </label>
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={() => void save()} disabled={!dirty}>
            Save
          </button>
          <button type="button" onClick={() => void importOpenApi()} disabled={dirty} title={dirty ? 'Save or discard your edits first.' : undefined}>
            Import OpenAPI…
          </button>
          <button type="button" onClick={() => void exportCode(false)} disabled={dirty} title={dirty ? 'Save your edits first.' : undefined}>
            Export to code…
          </button>
          {dirty && <span className="warning">Unsaved changes</span>}
          {message !== null && <span className="ok">{message}</span>}
        </div>
        {exportTarget !== null && output !== null && output.code !== 0 && (
          <div className="row">
            <span className="muted">Files already exist there.</span>
            <button type="button" onClick={() => void exportCode(true)}>
              Overwrite them
            </button>
          </div>
        )}
        {errors.length > 0 && (
          <ul className="errors" role="alert" aria-label="Problems">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </section>
      <div className="split">
        <div className="list" aria-label="Workspace endpoints" role="list">
          {draft.endpoints.map((item, index) => (
            <div key={index} role="listitem" className={index === selected ? 'endpoint selected' : 'endpoint'}>
              <button type="button" className="endpoint-main" onClick={() => setSelected(index)} aria-pressed={index === selected}>
                <span className={`method ${item.method.toLowerCase()}`}>{item.method}</span>
                <span className="endpoint-path">{item.path || '(no path)'}</span>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              change({ ...draft, endpoints: [...draft.endpoints, emptyEndpoint(draft.endpoints.length + 1)] });
              setSelected(draft.endpoints.length);
            }}
          >
            Add endpoint
          </button>
        </div>
        {endpoint === undefined ? (
          <p className="muted">This workspace has no endpoints yet.</p>
        ) : (
          <EndpointForm
            key={selected}
            endpoint={endpoint}
            onChange={(next) => change({ ...draft, endpoints: draft.endpoints.map((item, index) => (index === selected ? next : item)) })}
            onRemove={() => {
              change({ ...draft, endpoints: draft.endpoints.filter((_item, index) => index !== selected) });
              setSelected(0);
            }}
          />
        )}
      </div>
      <Output output={output} title="Last command" />
    </div>
  );
}
