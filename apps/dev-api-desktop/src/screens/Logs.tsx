import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useClient } from '../client/context';
import type { ProjectInfo } from '../client/types';
import { parseLogs } from '../lib/logs';

const LINES = 300;

/** The server log, as `tempo-api logs` prints it (redacted by the server). Re-read every 2 seconds. */
export function Logs({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const logs = useQuery({
    queryKey: ['logs', project.path],
    queryFn: () => client.cli(project.path, { kind: 'logs', lines: LINES }),
    refetchInterval: follow ? 2000 : false,
  });
  const view = useMemo(() => (logs.data === undefined ? null : parseLogs(logs.data, filter)), [logs.data, filter]);

  useEffect(() => {
    if (follow) end.current?.scrollIntoView({ block: 'end' });
  }, [follow, view]);

  return (
    <div className="screen logs">
      <div className="row">
        <label className="grow">
          Filter
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Text in a line" />
        </label>
        <label className="check">
          <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} /> Follow
        </label>
        <button type="button" onClick={() => void logs.refetch()}>
          Refresh
        </button>
      </div>
      {logs.isError && (
        <p className="error" role="alert">
          {logs.error.message}
        </p>
      )}
      {view?.notice !== null && view?.notice !== undefined && <p className="muted">{view.notice}</p>}
      <pre className="logbox" aria-label="Server log">
        {view?.lines.join('\n')}
        <div ref={end} />
      </pre>
      <p className="muted">Last {LINES} lines. Tokens, passwords and similar fields are redacted by the server.</p>
    </div>
  );
}
