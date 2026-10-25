import { buildMatrix, readTempoJson } from '@/lib/env-matrix';
import { getRepoRoot } from '@/lib/regions';

/** Renders the environment matrix from `template/.tempo.json`, so the docs cannot drift from it. */
export function EnvMatrix() {
  const { envs, rows } = buildMatrix(readTempoJson(getRepoRoot()));
  return (
    <div className="my-4 overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Key</th>
            {envs.map((env) => (
              <th key={env}>{env}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.key.replaceAll('`', '')}</td>
              {row.values.map((value, index) => (
                <td key={envs[index]}>
                  <code>{value}</code>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
