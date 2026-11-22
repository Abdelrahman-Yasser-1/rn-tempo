import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus, Definition } from '../api/types';
import { useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { latencyFormFrom, latencyFrom, networkFormFrom, networkFrom } from '../lib/network';
import { ErrorNote, Hint } from '../ui/bits';
import { LatencyFields, NetworkFields } from '../ui/NetworkFields';

/** The default delay, the network preset and test mode of the whole backend. An endpoint can set its own. */
export function SettingsNetwork({ backend, definition }: { backend: BackendStatus; definition: Definition }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const [latency, setLatency] = useState(() => latencyFormFrom(definition.latency?.default, 'none'));
  const [network, setNetwork] = useState(() => networkFormFrom(definition.network, 'instant'));
  const [testMode, setTestMode] = useState(definition.testMode ?? false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const wait = latencyFrom(latency);
      const net = networkFrom(network);
      if (!wait.ok || !net.ok) {
        setProblem(!wait.ok ? wait.message : !net.ok ? net.message : null);
        return false;
      }
      setProblem(null);
      const instant = net.value?.preset === 'instant' && Object.keys(net.value).length === 1;
      await adminSend(api, backend.path, 'PUT', '/settings/network', {
        ...(instant || net.value === undefined ? {} : { network: net.value }),
        ...(wait.value === undefined ? {} : { latency: { default: wait.value } }),
        ...(testMode ? { testMode: true } : {}),
      });
      return true;
    },
    onSuccess: async (saved) => {
      if (saved) await refresh();
    },
  });

  return (
    <section className="card" aria-label="Network">
      <h2>Network</h2>
      <p className="muted">Make the backend as slow as a real connection, to see how the app behaves. An endpoint can set its own delay or network in its form, and a scenario&apos;s delay wins over both.</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <LatencyFields form={latency} onChange={setLatency} />
        <NetworkFields form={network} onChange={setNetwork} />
        <label className="check">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(event) => {
              setTestMode(event.target.checked);
            }}
          />
          Test mode <Hint text="Turns every delay, speed limit and timeout off, and fixes the clock and random values, so tests are fast and repeatable. A single request can do the same with the header x-tempo-test-mode: 1, and keep its delays with x-tempo-test-delays: 1." />
        </label>
        <p className="muted">
          Test mode is for automated tests: no delays, no speed limits, no timeouts, a fixed clock and seeded random values. Send <code>x-tempo-test-mode: 1</code> to turn it on for one request; add <code>x-tempo-test-delays: 1</code> to keep the configured delays anyway.
        </p>
        <ErrorNote error={problem ?? (save.error === null ? null : errorMessage(save.error))} />
        <div className="row">
          <button type="submit" className="primary" disabled={save.isPending}>
            Save network settings
          </button>
          {save.isSuccess && save.data ? (
            <span className="ok" role="status">
              Saved. It applies to the next request.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
