import { useState } from 'react';

import type { ProjectInfo } from '../client/types';
import { screens } from '../screens/registry';

export function ProjectView({ project }: { project: ProjectInfo }) {
  const tabs = screens.filter((screen) => screen.workspaceOnly !== true || project.kind === 'workspace');
  const [active, setActive] = useState(tabs[0]?.id ?? 'overview');
  const current = tabs.find((screen) => screen.id === active) ?? tabs[0];
  const Current = current?.component;
  return (
    <section className="project-view" aria-label={project.name}>
      <header>
        <h2>{project.name}</h2>
        <code className="path">{project.path}</code>
      </header>
      <div role="tablist" aria-label="Screens" className="tabs">
        {tabs.map((screen) => (
          <button
            key={screen.id}
            type="button"
            role="tab"
            id={`tab-${screen.id}`}
            aria-selected={screen.id === current?.id}
            aria-controls={`panel-${screen.id}`}
            onClick={() => setActive(screen.id)}
          >
            {screen.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${current?.id ?? 'overview'}`} aria-labelledby={`tab-${current?.id ?? 'overview'}`} className="panel">
        {Current !== undefined && <Current key={`${project.path}:${current?.id ?? ''}`} project={project} />}
      </div>
    </section>
  );
}
