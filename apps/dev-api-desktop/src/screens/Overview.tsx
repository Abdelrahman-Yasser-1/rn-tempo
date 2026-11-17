import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useClient } from '../client/context';
import type { CliAction, CliOutput, ProjectInfo } from '../client/types';
import { CopyButton } from '../components/CopyButton';
import { Output } from '../components/Output';
import { QrCode } from '../components/QrCode';
import { keys, useProjectState, useServerInfo } from '../hooks/queries';
import { errorMessage } from '../lib/errors';
import { isOlderThanSupported, MIN_DEV_API_VERSION, urlRows } from '../lib/urls';

export function Overview({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const state = useProjectState(project.path);
  const running = state.data?.running === true;
  const info = useServerInfo(project.path, running ? (state.data?.pid ?? null) : null);

  const [port, setPort] = useState('');
  const [http, setHttp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<CliOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  const portNumber = port.trim() === '' ? null : Number(port);
  const portInvalid = portNumber !== null && (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535);

  const run = async (action: CliAction) => {
    setBusy(true);
    setError(null);
    try {
      setOutput(await client.cli(project.path, action));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: keys.state(project.path) });
    }
  };

  const olderThanSupported = isOlderThanSupported(project.tempoApi?.version ?? null);
  const lan = info.data?.urls.lan;

  return (
    <div className="screen overview">
      <section className="card" aria-label="Server">
        <div className="row">
          <span className={running ? 'dot on' : 'dot'} role="img" aria-label={running ? 'running' : 'stopped'} />
          <strong>{running ? `Running on port ${state.data?.port ?? ''} (${state.data?.scheme ?? ''})` : 'Stopped'}</strong>
          <span className="spacer" />
          {running ? (
            <button type="button" onClick={() => void run({ kind: 'down' })} disabled={busy}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void run({ kind: 'up', port: portNumber, http })}
              disabled={busy || portInvalid}
            >
              {busy ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
        {!running && (
          <div className="row options">
            <fieldset className="segmented" aria-label="Protocol">
              <label>
                <input type="radio" name="protocol" checked={!http} onChange={() => setHttp(false)} /> HTTPS
              </label>
              <label>
                <input type="radio" name="protocol" checked={http} onChange={() => setHttp(true)} /> HTTP
              </label>
            </fieldset>
            <label>
              Port
              <input
                inputMode="numeric"
                value={port}
                onChange={(event) => setPort(event.target.value)}
                placeholder="from the config"
                aria-invalid={portInvalid}
                className="port"
              />
            </label>
            {!http && <span className="muted">HTTPS needs a certificate. Without one the server falls back to HTTP (see Certificates).</span>}
          </div>
        )}
        {state.data?.startedByApp === true && <p className="muted">Started by this app: it stops when you quit.</p>}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-label="Dev API">
        <h2>Dev API</h2>
        <p>
          {project.tempoApi === null
            ? 'No dev API found for this project.'
            : project.tempoApi.source === 'project'
              ? `Using the project's own @rn-tempo/dev-api${project.tempoApi.version === null ? '' : ` ${project.tempoApi.version}`}.`
              : 'Using the dev API bundled with this app.'}
        </p>
        {olderThanSupported && (
          <p className="warning" role="alert">
            This project&apos;s dev API is older than {MIN_DEV_API_VERSION}, which this app supports. Update <code>@rn-tempo/dev-api</code>.
          </p>
        )}
      </section>

      {running && (
        <section className="card" aria-label="Addresses">
          <h2>Addresses</h2>
          {info.isPending && <p className="muted">Reading the server…</p>}
          {info.isError && (
            <p className="error" role="alert">
              {info.error.message}
            </p>
          )}
          {info.data !== undefined && (
            <>
              <ul className="urls">
                {urlRows(info.data).map((row) => (
                  <li key={row.label}>
                    <span className="label">{row.label}</span>
                    <code>{row.url}</code>
                    <CopyButton text={row.url} />
                  </li>
                ))}
              </ul>
              <div className="qr-row">
                {lan !== undefined ? (
                  <figure>
                    <QrCode text={lan} label={`QR code for ${lan}`} />
                    <figcaption>Scan with a phone on the same Wi-Fi: {lan}</figcaption>
                  </figure>
                ) : (
                  <p className="muted">No LAN address: the server listens on this Mac only.</p>
                )}
                <div className="links">
                  <h3>Open</h3>
                  <button type="button" onClick={() => void client.openTarget(project.path, 'swagger')}>
                    Swagger UI
                  </button>
                  <button type="button" onClick={() => void client.openTarget(project.path, 'openApi')}>
                    OpenAPI JSON
                  </button>
                  <button type="button" onClick={() => void run({ kind: 'collections' }).then(() => client.openTarget(project.path, 'generatedFolder'))}>
                    Postman files
                  </button>
                  <p className="muted">Postman files are written to the project&apos;s generated folder, then shown.</p>
                </div>
              </div>
            </>
          )}
        </section>
      )}
      <Output output={output} title="Last command" />
    </div>
  );
}
