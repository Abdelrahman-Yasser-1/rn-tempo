import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '../api/context';
import { keys, useBackends, useNode } from '../hooks/lb';
import { errorMessage } from '../lib/errors';

import { BackendView } from './BackendView';
import { Sidebar } from './Sidebar';

function NodeMissing({ message, docsUrl }: { message: string | null; docsUrl: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const recheck = () => {
    setChecking(true);
    void api
      .nodeInfo(true)
      .then((fresh) => {
        queryClient.setQueryData(keys.node, fresh);
      })
      .finally(() => {
        setChecking(false);
      });
  };
  return (
    <main className="centered" role="alert">
      <h1>Node.js is needed</h1>
      <p>{message ?? 'Node.js was not found.'}</p>
      <p className="muted">
        Install Node 24 or newer from <code>{docsUrl}</code>, then check again. You do not need to restart the app.
      </p>
      <button type="button" onClick={recheck} disabled={checking}>
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </main>
  );
}

export function App() {
  const node = useNode();
  const backends = useBackends();
  const [selected, setSelected] = useState<string | null>(null);

  if (node.isPending) return <p className="muted pad">Looking for Node.js…</p>;
  if (node.isError) {
    return (
      <p className="error pad" role="alert">
        {errorMessage(node.error)}
      </p>
    );
  }
  if (!node.data.ok) return <NodeMissing message={node.data.message} docsUrl={node.data.docsUrl} />;
  const current = backends.data?.find((backend) => backend.path === selected);

  return (
    <div className="layout">
      <Sidebar selected={selected} onSelect={setSelected} />
      <main>
        {current === undefined ? (
          <div className="centered">
            <h1>Tempo Local Backend</h1>
            <p className="muted">Pick a backend on the left, or make a new one. A backend is a folder that your app can talk to like a real server.</p>
          </div>
        ) : (
          <BackendView key={current.path} backend={current} onOpen={setSelected} />
        )}
      </main>
    </div>
  );
}
