import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useClient } from '../client/context';
import type { CliAction, CliOutput, ProjectInfo } from '../client/types';
import { CopyButton } from '../components/CopyButton';
import { Output } from '../components/Output';
import { QrCode } from '../components/QrCode';
import { useProjectState, useServerInfo } from '../hooks/queries';
import { caDownloadUrl, summarizeCert } from '../lib/certs';
import { errorMessage } from '../lib/errors';

const ANDROID_STEPS = [
  'Push the CA to the emulator with the button above (it copies the file to Download).',
  'On the emulator open Settings, then Security (or "Security & privacy"), then Encryption & credentials.',
  'Choose Install a certificate, then CA certificate, accept the warning, and pick tempo-dev-ca.pem.',
  'The emulator reaches this Mac at 10.0.2.2.',
];

export function Certificates({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const state = useProjectState(project.path);
  const running = state.data?.running === true;
  const info = useServerInfo(project.path, running ? (state.data?.pid ?? null) : null);
  const files = useQuery({ queryKey: ['certs', project.path], queryFn: () => client.certStatus(project.path), refetchInterval: 4000 });
  const sims = useQuery({ queryKey: ['sims'], queryFn: () => client.listBootedSimulators(), refetchOnWindowFocus: true });

  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<CliOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmMac, setConfirmMac] = useState(false);

  const run = async (label: string, action: CliAction) => {
    setBusy(label);
    setError(null);
    try {
      setOutput(await client.cli(project.path, action));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ['certs', project.path] });
    }
  };

  const hasCert = files.data?.hasCert === true;
  const summary = summarizeCert({ hasCert }, info.data);
  const caUrl = caDownloadUrl(info.data);

  return (
    <div className="screen certs">
      <section className="card" aria-label="Certificate status">
        <h2>Certificate</h2>
        <p className={summary.tone}>{summary.text}</p>
        <div className="row">
          <button type="button" className="primary" disabled={busy !== null} onClick={() => void run('create', { kind: 'certs', install: false })}>
            {busy === 'create' ? 'Working…' : hasCert ? 'Recreate certificate' : 'Create certificate'}
          </button>
          <span className="muted">Uses mkcert. Nothing changes this Mac&apos;s trust settings.</span>
        </div>
        {hasCert && running && <p className="muted">Restart the server after recreating, so it loads the new certificate.</p>}
      </section>

      <section className="card" aria-label="Trust on this Mac">
        <h2>Trust on this Mac</h2>
        <p className="muted">So Safari, Chrome and the Swagger page open the server without a warning.</p>
        {confirmMac ? (
          <div role="alertdialog" aria-label="Confirm trusting the CA" className="confirm">
            <p>
              <strong>This asks for your Mac password</strong> and adds the local development CA to this Mac&apos;s trust stores (<code>mkcert -install</code>). Anyone with the CA
              key on this Mac could then issue certificates your Mac trusts. Remove it later with <code>mkcert -uninstall</code>.
            </p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setConfirmMac(false);
                  void run('mac', { kind: 'certs', install: true });
                }}
              >
                Ask for my password and trust it
              </button>
              <button type="button" onClick={() => setConfirmMac(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" disabled={busy !== null} onClick={() => setConfirmMac(true)}>
              Trust on this Mac…
            </button>
          </div>
        )}
      </section>

      <section className="card" aria-label="iOS simulator">
        <h2>iOS simulator</h2>
        {sims.isPending && <p className="muted">Looking for booted simulators…</p>}
        {sims.isError && <p className="muted">{errorMessage(sims.error)}</p>}
        {sims.data?.length === 0 && <p className="muted">No simulator is booted. Boot one in Xcode or with the Simulator app, then come back.</p>}
        <ul className="plain">
          {sims.data?.map((sim) => (
            <li key={sim.udid} className="row">
              <span>
                {sim.name} <span className="muted">{sim.runtime}</span>
              </span>
              <span className="spacer" />
              <button type="button" disabled={busy !== null || !hasCert} onClick={() => void run(`ios-${sim.udid}`, { kind: 'trustIos', device: sim.udid })}>
                Trust on {sim.name}
              </button>
            </li>
          ))}
        </ul>
        {!hasCert && <p className="muted">Create the certificate first.</p>}
        <button type="button" className="ghost" onClick={() => void sims.refetch()}>
          Refresh the list
        </button>
      </section>

      <section className="card" aria-label="Android emulator">
        <h2>Android emulator</h2>
        <div className="row">
          <button type="button" disabled={busy !== null || !hasCert} onClick={() => void run('android', { kind: 'trustAndroid', push: true })}>
            Push to Android emulator
          </button>
        </div>
        <ol>
          {ANDROID_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="card" aria-label="Phone">
        <h2>Phone on the same Wi-Fi</h2>
        {caUrl === null ? (
          <p className="muted">Start the server over HTTPS (with a LAN address) to get a QR code for the CA download.</p>
        ) : (
          <div className="qr-row">
            <figure>
              <QrCode text={caUrl} label={`QR code for ${caUrl}`} />
              <figcaption>{caUrl}</figcaption>
            </figure>
            <div className="links">
              <CopyButton text={caUrl} label="Copy link" />
              <p className="muted">Open it on the phone, install the profile, then trust it in the phone&apos;s settings (see the Local HTTPS guide).</p>
            </div>
          </div>
        )}
      </section>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Output output={output} title="Last command" />
    </div>
  );
}
