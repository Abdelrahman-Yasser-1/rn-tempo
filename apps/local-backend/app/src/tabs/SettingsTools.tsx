import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi, useCapabilities } from '../api/context';
import type { BackendStatus, ContractReport } from '../api/types';
import { errorMessage } from '../lib/errors';
import { ErrorNote } from '../ui/bits';

export function parseReport(stdout: string): ContractReport | null {
  try {
    const value = JSON.parse(stdout) as Partial<ContractReport>;
    return Array.isArray(value.missing) && Array.isArray(value.differences) ? (value as ContractReport) : null;
  } catch {
    return null;
  }
}

function ReportView({ report }: { report: ContractReport }) {
  const problems = report.missing.length + report.methodMismatches.length + report.differences.length;
  return (
    <div className="stack" aria-label="Check result">
      {report.ok ? (
        <p className="ok" role="status">
          No differences. Every endpoint in the file is here and its answers fit ({report.counts.matched} checked).
        </p>
      ) : (
        <p className="error" role="alert">
          {problems} {problems === 1 ? 'difference' : 'differences'} from the file.
        </p>
      )}
      {report.missing.length === 0 ? null : (
        <>
          <h3>Missing from this backend</h3>
          <ul>
            {report.missing.map((item) => (
              <li key={`${item.method} ${item.path}`}>
                <code>
                  {item.method} {item.path}
                </code>
              </li>
            ))}
          </ul>
        </>
      )}
      {report.methodMismatches.length === 0 ? null : (
        <>
          <h3>Different method</h3>
          <ul>
            {report.methodMismatches.map((item) => (
              <li key={`${item.method} ${item.path}`}>
                <code>
                  {item.method} {item.path}
                </code>{' '}
                exists here as {item.backendMethods.join(', ')}.
              </li>
            ))}
          </ul>
        </>
      )}
      {report.differences.length === 0 ? null : (
        <>
          <h3>Answers that differ</h3>
          <ul>
            {report.differences.map((item) => (
              <li key={`${item.method} ${item.path} ${item.status} ${item.property} ${item.kind}`}>
                <code>
                  {item.method} {item.path}
                </code>
                : {item.message}
              </li>
            ))}
          </ul>
        </>
      )}
      {report.unchecked.length === 0 ? null : (
        <p className="muted">{report.unchecked.length} answers could not be compared (for example custom code).</p>
      )}
      {report.extra.length === 0 ? null : <p className="muted">{report.extra.length} endpoints exist only here. That is fine.</p>}
    </div>
  );
}

/** Backup, restore, the OpenAPI check and Open folder. */
export function SettingsTools({ backend, onOpen }: { backend: BackendStatus; onOpen: (path: string) => void }) {
  const api = useApi();
  const { reveal: canReveal } = useCapabilities();
  const [note, setNote] = useState<string | null>(null);
  const [report, setReport] = useState<ContractReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const backup = useMutation({
    mutationFn: () => api.exportSnapshot(backend.path),
    onSuccess: (saved) => {
      if (saved !== null) setNote(`Backup saved to ${saved}. It holds definitions, data and media, but no passwords for the server or certificates.`);
    },
  });
  const restore = useMutation({
    mutationFn: () => api.restoreSnapshot(),
    onSuccess: (restored) => {
      if (restored !== null) {
        setNote(`Restored into ${restored.path}.`);
        onOpen(restored.path);
      }
    },
  });
  const check = useMutation({
    mutationFn: () => api.checkOpenapi(backend.path),
    onSuccess: (output) => {
      setReport(null);
      setFailure(null);
      if (output === null) return;
      const parsed = parseReport(output.stdout);
      if (parsed === null) setFailure(output.stderr.replace(/^local-backend-engine: /, '').trim() || 'That file could not be checked.');
      else setReport(parsed);
    },
  });
  const reveal = useMutation({ mutationFn: () => api.reveal(backend.path, 'folder') });

  return (
    <>
      <section className="card" aria-label="Backup">
        <h2>Backup</h2>
        <p className="muted">One file with the definitions, the data and the media. Restoring always goes into a new folder, so nothing is overwritten.</p>
        <div className="row">
          <button type="button" disabled={backup.isPending} onClick={() => { backup.mutate(); }}>
            Export backup…
          </button>
          <button type="button" disabled={restore.isPending} onClick={() => { restore.mutate(); }}>
            Restore into new folder…
          </button>
        </div>
        {note === null ? null : <p className="ok" role="status">{note}</p>}
        <ErrorNote error={backup.error ?? restore.error} />
      </section>
      <section className="card" aria-label="Check against OpenAPI">
        <h2>Check against an OpenAPI file</h2>
        <p className="muted">Compares this backend with a contract such as the template&apos;s api/generated/openapi.json, and lists what is missing or different.</p>
        <div className="row">
          <button type="button" disabled={check.isPending} onClick={() => { check.mutate(); }}>
            Check against OpenAPI file…
          </button>
        </div>
        <ErrorNote error={failure ?? (check.error === null ? null : errorMessage(check.error))} />
        {report === null ? null : <ReportView report={report} />}
      </section>
      <section className="card" aria-label="Folder">
        <h2>Folder</h2>
        {canReveal ? (
          <>
            <p className="muted">
              <code>{backend.path}</code>
            </p>
            <div className="row">
              <button type="button" onClick={() => { reveal.mutate(); }}>
                Open folder
              </button>
            </div>
            <ErrorNote error={reveal.error} />
          </>
        ) : (
          <p className="muted">
            This backend is the folder <code>{backend.path}</code> in the backends directory of the machine that runs the server. A browser cannot open it in a file manager; use Export backup to get its files.
          </p>
        )}
      </section>
    </>
  );
}
