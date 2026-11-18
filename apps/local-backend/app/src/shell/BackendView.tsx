import { useRef, useState, type KeyboardEvent } from 'react';

import type { BackendStatus } from '../api/types';
import { Dashboard } from '../tabs/Dashboard';
import { Data } from '../tabs/Data';
import { Endpoints } from '../tabs/Endpoints';
import { Logs } from '../tabs/Logs';
import { Media } from '../tabs/Media';
import { Users } from '../tabs/Users';
import { StatusDot } from '../ui/bits';

export const TABS = ['Dashboard', 'Endpoints', 'Data', 'Media', 'Users', 'Content', 'Logs', 'Settings'] as const;
export type TabName = (typeof TABS)[number];

function Soon({ name }: { name: string }) {
  return <p className="empty">The {name} tab arrives in the next step.</p>;
}

/** The tabs that read the engine's admin API need a running backend; a stopped one gets one sentence. */
function BackendOnly({ backend, show }: { backend: BackendStatus; show: (path: string) => React.ReactNode }) {
  if (backend.state !== 'running') return <p className="empty">Start the backend on the Dashboard tab to use this one.</p>;
  return <>{show(backend.path)}</>;
}

/** The 8 tabs of one backend. */
export function BackendView({ backend, render }: { backend: BackendStatus; render?: Partial<Record<TabName, (backend: BackendStatus) => React.ReactNode>> }) {
  const [tab, setTab] = useState<TabName>('Dashboard');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + TABS.length) % TABS.length;
    const name = TABS[next];
    if (name !== undefined) {
      setTab(name);
      refs.current[next]?.focus();
    }
  };

  const renderers: Partial<Record<TabName, (backend: BackendStatus) => React.ReactNode>> = {
    Dashboard: (b) => <Dashboard backend={b} />,
    Data: (b) => <BackendOnly backend={b} show={(path) => <Data backend={path} />} />,
    Media: (b) => <BackendOnly backend={b} show={() => <Media backend={b} />} />,
    Users: (b) => <BackendOnly backend={b} show={(path) => <Users backend={path} />} />,
    Logs: (b) => <BackendOnly backend={b} show={() => <Logs backend={b} />} />,
    Endpoints: (b) => <BackendOnly backend={b} show={(path) => <Endpoints backend={path} />} />,
    ...render,
  };
  const draw = renderers[tab];

  return (
    <div className="project-view">
      <header>
        <h1>
          <StatusDot state={backend.state} /> {backend.name}
        </h1>
        <code className="path">{backend.path}</code>
      </header>
      <div className="tabs" role="tablist" aria-label="Backend sections">
        {TABS.map((name, index) => (
          <button
            key={name}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls="panel"
            tabIndex={tab === name ? 0 : -1}
            onClick={() => {
              setTab(name);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="panel" role="tabpanel" id="panel" aria-labelledby={`tab-${tab}`}>
        {draw === undefined ? <Soon name={tab} /> : draw(backend)}
      </div>
    </div>
  );
}
