import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi, useCapabilities } from '../api/context';
import type { BackendStatus, CertInfo, CliAction, CliOutput } from '../api/types';
import { keys } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { CopyButton } from '../ui/CopyButton';
import { QrCode } from '../ui/QrCode';
import { ErrorNote } from '../ui/bits';

/** The first non-empty line of a command's answer, or its error. */
function summary(output: CliOutput): string {
  const text = output.code === 0 ? `${output.stdout}\n${output.stderr}` : output.stderr || output.stdout;
  return (
    text
      .split('\n')
      .map((line) => line.replace(/^local-backend-engine: /, '').trim())
      .find((line) => line !== '') ?? (output.code === 0 ? 'Done.' : 'It did not work.')
  );
}

/** Certificate status, create, and trust on this Mac, an iOS simulator or an Android emulator, plus the phone QR code. */
export function SettingsCertificates({ backend, certs }: { backend: BackendStatus; certs: CertInfo | undefined }) {
  const api = useApi();
  const { trustLocalDevices } = useCapabilities();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmMac, setConfirmMac] = useState(false);
  const simulators = useQuery({ queryKey: keys.admin(backend.path, 'simulators'), queryFn: () => api.listSimulators(), retry: false, enabled: trustLocalDevices });

  const run = useMutation({
    mutationFn: (action: CliAction) => api.engineCli(backend.path, action),
    onSuccess: async (output, action) => {
      setResult({ ok: output.code === 0, text: summary(output) });
      if (action.kind === 'certs') await queryClient.invalidateQueries({ queryKey: keys.admin(backend.path, 'certs') });
    },
  });
  const go = (action: CliAction) => {
    setResult(null);
    run.mutate(action);
  };
  const phoneUrl = certs?.lan != null && backend.scheme !== null && backend.port !== null ? `${backend.scheme}://${certs.lan}:${String(backend.port)}/__ca.pem` : null;

  return (
    <section className="card" aria-label="Certificates">
      <h2>Certificates</h2>
      <p className="muted">HTTPS needs a certificate that your devices trust. Nothing here changes a trust store unless you press a Trust button.</p>
      <p>
        Certificate: <strong>{certs === undefined ? '…' : certs.hasCert ? 'ready' : 'not made yet'}</strong>
      </p>
      <div className="row">
        <button type="button" className={certs?.hasCert === true ? undefined : 'primary'} disabled={run.isPending} onClick={() => { go({ kind: 'certs' }); }}>
          {certs?.hasCert === true ? 'Create a new certificate' : 'Create certificate'}
        </button>
        {trustLocalDevices ? (
          <>
            <button type="button" disabled={run.isPending || certs?.hasCa !== true} onClick={() => { setConfirmMac(true); }}>
              Trust on this Mac…
            </button>
            <button type="button" disabled={run.isPending || certs?.hasCa !== true} onClick={() => { go({ kind: 'pushAndroid', serial: null }); }}>
              Send to Android emulator
            </button>
          </>
        ) : null}
      </div>
      {trustLocalDevices ? null : (
        <p className="muted">
          Trusting the certificate on this computer, a simulator or an emulator changes a trust store, so it is not done from the browser. Use the desktop app, or run <code>tempo-local-backend trust mac</code> (or <code>trust ios</code>, <code>trust android</code>) in a terminal on the machine
          that runs the server.
        </p>
      )}
      {trustLocalDevices ? <h3>iOS simulator</h3> : null}
      {!trustLocalDevices ? null : simulators.data === undefined ? (
        <p className="muted">{simulators.isError ? errorMessage(simulators.error) : 'Looking for simulators…'}</p>
      ) : simulators.data.length === 0 ? (
        <p className="muted">No simulator is running. Start one, then reopen this tab.</p>
      ) : (
        <ul className="plain">
          {simulators.data.map((simulator) => (
            <li key={simulator.udid} className="between">
              <span>
                {simulator.name} <span className="muted">({simulator.runtime})</span>
              </span>
              <button type="button" disabled={run.isPending || certs?.hasCa !== true} aria-label={`Trust on ${simulator.name}`} onClick={() => { go({ kind: 'trustIos', device: simulator.udid }); }}>
                Trust on this simulator
              </button>
            </li>
          ))}
        </ul>
      )}
      <h3>Phone</h3>
      {phoneUrl === null ? (
        <p className="muted">Start the backend on Wi-Fi to get a code a phone can scan.</p>
      ) : (
        <div className="qr-row">
          <figure>
            <QrCode text={phoneUrl} label={`QR code for ${phoneUrl}`} size={140} />
            <figcaption>
              Scan to download the public certificate, then install it in the phone&apos;s settings. <CopyButton text={phoneUrl} />
            </figcaption>
          </figure>
        </div>
      )}
      {result === null ? null : (
        <p className={result.ok ? 'ok' : 'error'} role={result.ok ? 'status' : 'alert'}>
          {result.text}
        </p>
      )}
      <ErrorNote error={run.error === null ? null : errorMessage(run.error)} />
      {confirmMac ? (
        <ConfirmDialog
          title="Trust the certificate on this Mac?"
          confirmLabel="Trust on this Mac"
          onCancel={() => { setConfirmMac(false); }}
          onConfirm={() => {
            setConfirmMac(false);
            go({ kind: 'trustMac' });
          }}
        >
          <p>This adds the local certificate authority to this Mac&apos;s trust stores, so browsers accept it. macOS asks for your password.</p>
          <p className="warning">Anyone with the authority&apos;s private key could then create certificates this Mac trusts. The key stays on this Mac.</p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
