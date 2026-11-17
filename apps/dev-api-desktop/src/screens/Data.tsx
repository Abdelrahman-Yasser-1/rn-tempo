import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useClient } from '../client/context';
import type { ProjectInfo } from '../client/types';
import { useProjectState } from '../hooks/queries';
import { cellText, columnsOf, filterRows, type DataReply } from '../lib/data';
import { errorMessage } from '../lib/errors';
import { controlJson, jsonHeaders } from '../lib/server';

export function Data({ project }: { project: ProjectInfo }) {
  const client = useClient();
  const queryClient = useQueryClient();
  const state = useProjectState(project.path);
  const pid = state.data?.running === true ? state.data.pid : null;
  const data = useQuery({
    queryKey: ['data', project.path, pid],
    enabled: pid !== null,
    queryFn: () => controlJson<DataReply>(client, project.path, { method: 'GET', path: '/__tempo/data' }),
    refetchInterval: 5000,
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collection = data.data?.collections.find((item) => item.name === chosen) ?? data.data?.collections[0];
  const rows = useMemo(() => filterRows(collection?.items ?? [], text), [collection, text]);
  const columns = useMemo(() => columnsOf(collection?.items ?? []), [collection]);

  const reset = async () => {
    setError(null);
    setConfirming(false);
    try {
      await controlJson(client, project.path, { method: 'POST', path: '/__tempo/reset', headers: jsonHeaders, body: '{}' });
      await queryClient.invalidateQueries({ queryKey: ['data', project.path] });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  if (pid === null) return <p className="muted">Start the server on the Overview tab to see its stored data.</p>;
  if (data.isPending) return <p className="muted">Loading…</p>;
  if (data.isError) {
    return (
      <p className="error" role="alert">
        {data.error.message}
      </p>
    );
  }
  if (data.data.collections.length === 0) {
    return <p className="muted">This API has no stored records. Records appear when the config declares a resource().</p>;
  }

  return (
    <div className="screen data">
      <div className="row">
        <label>
          Collection
          <select value={collection?.name ?? ''} onChange={(event) => setChosen(event.target.value)}>
            {data.data.collections.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.total})
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Filter
          <input type="search" value={text} onChange={(event) => setText(event.target.value)} placeholder="Any value" />
        </label>
        <span className="spacer" />
        {confirming ? (
          <>
            <span>Re-seed all data?</span>
            <button type="button" className="primary" onClick={() => void reset()}>
              Yes, reset
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)}>
            Reset
          </button>
        )}
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted" role="status">
        {rows.length} of {collection?.total ?? 0} records shown. Read-only; private fields are redacted by the server.
      </p>
      <table className="table" aria-label="Records">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{cellText(row[column])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
