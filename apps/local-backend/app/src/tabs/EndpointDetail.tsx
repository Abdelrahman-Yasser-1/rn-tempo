import type { EndpointDef, Scenario } from '../api/types';
import { faultsSummary } from '../lib/endpointFaults';
import { SchemaView } from '../ui/SchemaView';
import { Modal } from '../ui/Modal';

/** Whether there is anything to show: its own faults, a request schema or a documented response. */
export function hasDetail(endpoint: EndpointDef): boolean {
  if (faultsSummary(endpoint.faults) !== null) return true;
  if (endpoint.type !== 'static') return false;
  return endpoint.request !== undefined || Object.values(endpoint.scenarios ?? {}).some((scenario) => scenario.schema !== undefined || scenario.description !== undefined);
}

function Example({ scenario }: { scenario: Scenario }) {
  if (scenario.body === undefined) return <p className="muted">No body.</p>;
  return (
    <details>
      <summary>Example</summary>
      <pre className="logbox">{JSON.stringify(scenario.body, null, 2)}</pre>
    </details>
  );
}

/** The request and response schemas of an endpoint (from an imported API file), per scenario, with the examples. */
export function EndpointDetail({ endpoint, onClose }: { endpoint: EndpointDef; onClose: () => void }) {
  const request = endpoint.type === 'static' ? endpoint.request : undefined;
  const scenarios = Object.entries(endpoint.scenarios ?? {});
  const faultsLine = faultsSummary(endpoint.faults);
  return (
    <Modal title={`${endpoint.method} ${endpoint.path}`} onClose={onClose} wide>
      {endpoint.summary === undefined ? null : <p>{endpoint.summary}</p>}
      {faultsLine === null ? null : <p className="muted" aria-label="Endpoint faults">{faultsLine}</p>}
      {endpoint.type !== 'static' ? null : (
        <>
          <section aria-label="Request">
            <h3>Request</h3>
            {request === undefined ? <p className="muted">No request rules: anything is accepted.</p> : null}
            {request?.params === undefined ? null : <SchemaView schema={request.params} label="Path parameters" />}
            {request?.query === undefined ? null : <SchemaView schema={request.query} label="Query" />}
            {request?.body === undefined ? null : <SchemaView schema={request.body} label={request.bodyRequired === true ? 'Body (required)' : 'Body'} />}
            {request !== undefined ? <p className="muted">A request that does not match answers 400 and names the wrong fields.</p> : null}
          </section>
          <section aria-label="Responses">
            <h3>Responses</h3>
            {scenarios.length === 0 ? <p className="muted">No documented responses.</p> : null}
            {scenarios.map(([name, scenario]) => (
              <div key={name} className="scenario-doc" role="group" aria-label={`Response ${name}`}>
                <p>
                  <code>{name}</code> <span className="badge">{scenario.status ?? 200}</span> {scenario.description ?? ''}
                </p>
                {scenario.schema === undefined ? null : <SchemaView schema={scenario.schema} label={`Schema of ${name}`} />}
                <Example scenario={scenario} />
              </div>
            ))}
          </section>
        </>
      )}
      <div className="row">
        <span className="spacer" />
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
