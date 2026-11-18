import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';

import { useClient } from '../client/context';
import type { Recent } from '../client/types';
import { keys, useProjectState, useRecents } from '../hooks/queries';
import { errorMessage } from '../lib/errors';

function ProjectRow({ recent, selected, onSelect, onRemove }: { recent: Recent; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const state = useProjectState(recent.path, 3000);
  const running = state.data?.running === true;
  return (
    <li className={selected ? 'project selected' : 'project'}>
      <button type="button" className="project-main" onClick={onSelect} aria-current={selected ? 'true' : undefined}>
        <span className={running ? 'dot on' : 'dot'} role="img" aria-label={running ? 'running' : 'stopped'} />
        <span className="project-name">{recent.name}</span>
        <span className="tag">{recent.kind === 'workspace' ? 'workspace' : 'code'}</span>
      </button>
      <button type="button" className="ghost remove" aria-label={`Remove ${recent.name} from the list`} onClick={onRemove}>
        ×
      </button>
    </li>
  );
}

export function Sidebar({ selected, onSelect }: { selected: string | null; onSelect: (path: string | null) => void }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const recents = useRecents();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'app' | 'folder'>('app');

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.recents });

  const addFolder = async () => {
    setError(null);
    try {
      const folder = await client.pickFolder('Open a project folder');
      if (folder === null) return;
      const project = await client.openProject(folder);
      await refresh();
      onSelect(project.path);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const createWorkspace = async (event: SyntheticEvent) => {
    event.preventDefault();
    setError(null);
    try {
      let parent: string | null = null;
      if (where === 'folder') {
        parent = await client.pickFolder('Choose where to create the workspace');
        if (parent === null) return;
      }
      const project = await client.createWorkspace(name, parent);
      setCreating(false);
      setName('');
      await refresh();
      onSelect(project.path);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const remove = async (path: string) => {
    await client.removeRecent(path);
    await refresh();
    if (selected === path) onSelect(null);
  };

  return (
    <nav className="sidebar" aria-label="Projects">
      <header>
        <h1>Tempo Dev API</h1>
      </header>
      <div className="actions">
        <button type="button" onClick={() => void addFolder()}>
          Add folder…
        </button>
        <button type="button" className="ghost" onClick={() => setCreating(!creating)} aria-expanded={creating}>
          New workspace
        </button>
      </div>
      {creating && (
        <form className="new-workspace" onSubmit={(event) => void createWorkspace(event)}>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="my-api" autoFocus />
          </label>
          <label>
            Stored in
            <select value={where} onChange={(event) => setWhere(event.target.value === 'folder' ? 'folder' : 'app')}>
              <option value="app">The app&apos;s data folder</option>
              <option value="folder">A folder I choose…</option>
            </select>
          </label>
          <button type="submit" disabled={name.trim() === ''}>
            Create
          </button>
        </form>
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h2>Recent</h2>
      {recents.data?.length === 0 && <p className="muted">No projects yet. Add a folder with <code>api/tempo-api.config.ts</code>, or make a workspace.</p>}
      <ul>
        {recents.data?.map((recent) => (
          <ProjectRow
            key={recent.path}
            recent={recent}
            selected={recent.path === selected}
            onSelect={() => onSelect(recent.path)}
            onRemove={() => void remove(recent.path)}
          />
        ))}
      </ul>
    </nav>
  );
}
