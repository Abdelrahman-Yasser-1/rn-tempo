import { useRef, useState, type KeyboardEvent } from 'react';

import { useApi } from '../api/context';
import { atLeast } from '../api/team';
import { RoleProvider, useRoleOn } from '../hooks/team';

import type { BackendStatus } from '../api/types';
import { Content } from '../tabs/Content';
import { Dashboard } from '../tabs/Dashboard';
import { Data } from '../tabs/Data';
import { Endpoints } from '../tabs/Endpoints';
import { Logs } from '../tabs/Logs';
import { Media } from '../tabs/Media';
import { Settings } from '../tabs/Settings';
import { TeamTab } from '../tabs/Team';
import { Users } from '../tabs/Users';
import { StatusDot } from '../ui/bits';

export const TABS = ['Dashboard', 'Endpoints', 'Data', 'Media', 'Users', 'Content', 'Logs', 'Settings', 'Team'] as const;
export type TabName = (typeof TABS)[number];

/** The tabs that read the engine's admin API need a running backend; a stopped one gets one sentence. */
function BackendOnly({ backend, show }: { backend: BackendStatus; show: (path: string) => React.ReactNode }) {
  if (backend.state !== 'running') return <p className="empty">Start the backend on the Dashboard tab to use this one.</p>;
  return <>{show(backend.path)}</>;
}

/** The tabs of one backend: eight everywhere, plus Team on a team server for admins and the owner (Settings is theirs there too). */
export function BackendView({ backend, onOpen, render }: { backend: BackendStatus; onOpen: (path: string) => void; render?: Partial<Record<TabName, (backend: BackendStatus) => React.ReactNode>> }) {
  const api = useApi();
  const role = useRoleOn(backend.path);
  const team = api.team !== null;
  const admin = atLeast(role, 'admin');
  const tabs = TABS.filter((name) => (name === 'Team' ? team && admin : name === 'Settings' ? !team || admin : true));
  const [tab, setTab] = useState<TabName>('Dashboard');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    const name = tabs[next];
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
    Settings: (b) => <Settings backend={b} onOpen={onOpen} />,
    Content: (b) => <BackendOnly backend={b} show={(path) => <Content backend={path} />} />,
    Endpoints: (b) => <BackendOnly backend={b} show={(path) => <Endpoints backend={path} />} />,
    Team: (b) => <BackendOnly backend={b} show={(path) => <TeamTab backend={path} />} />,
    ...render,
  };
  const draw = renderers[tab];

  return (
    <RoleProvider role={role}>
    <div className="project-view">
      <header>
        <h1>
          <StatusDot state={backend.state} /> {backend.name}
        </h1>
        <code className="path">{backend.path}</code>
      </header>
      <div className="tabs" role="tablist" aria-label="Backend sections">
        {tabs.map((name, index) => (
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
        {draw?.(backend)}
      </div>
    </div>
    </RoleProvider>
  );
}
