import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useClient } from './client/context';
import { NodeMissing } from './components/NodeMissing';
import { ProjectView } from './components/ProjectView';
import { Sidebar } from './components/Sidebar';
import { useNode } from './hooks/queries';
import { errorMessage } from './lib/errors';

function SelectedProject({ path }: { path: string }) {
  const client = useClient();
  const project = useQuery({ queryKey: ['project', path], queryFn: () => client.openProject(path) });
  if (project.isPending) return <p className="muted pad">Opening…</p>;
  if (project.isError) {
    return (
      <p className="error pad" role="alert">
        {errorMessage(project.error)}
      </p>
    );
  }
  return <ProjectView project={project.data} />;
}

export function App() {
  const node = useNode();
  const [selected, setSelected] = useState<string | null>(null);

  if (node.isPending) return <p className="muted pad">Looking for Node.js…</p>;
  if (node.isError) {
    return (
      <p className="error pad" role="alert">
        {errorMessage(node.error)}
      </p>
    );
  }
  if (!node.data.ok) return <NodeMissing node={node.data} />;

  return (
    <div className="layout">
      <Sidebar selected={selected} onSelect={setSelected} />
      <main>
        {selected === null ? (
          <div className="centered">
            <h1>Tempo Dev API</h1>
            <p className="muted">Pick a project on the left, add a folder, or make a new workspace.</p>
            <p className="muted">Node {node.data.version}</p>
          </div>
        ) : (
          <SelectedProject key={selected} path={selected} />
        )}
      </main>
    </div>
  );
}
