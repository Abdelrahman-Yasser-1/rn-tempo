import { useState } from 'react';

import { useBackends } from '../hooks/lb';

import { BackendView } from './BackendView';
import { Sidebar } from './Sidebar';

export function App() {
  const backends = useBackends();
  const [selected, setSelected] = useState<string | null>(null);

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
