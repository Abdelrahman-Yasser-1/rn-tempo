import { useQuery } from '@tanstack/react-query';

import { useApi } from '../api/context';
import type { BackendStatus, Definition } from '../api/types';
import { keys, useAdminQuery } from '../hooks/lb';
import { EmptyState, ErrorNote } from '../ui/bits';

import { SettingsCertificates } from './SettingsCertificates';
import { SettingsNetwork } from './SettingsNetwork';
import { SettingsResponses } from './SettingsResponses';
import { SettingsServer } from './SettingsServer';
import { SettingsTools } from './SettingsTools';

/** Port and HTTPS, delays and network, response shape, certificates, token lifetimes, backup and the OpenAPI check. */
export function Settings({ backend, onOpen }: { backend: BackendStatus; onOpen: (path: string) => void }) {
  const api = useApi();
  const running = backend.state === 'running';
  const definition = useAdminQuery<Definition>(backend.path, '/definition', { enabled: running });
  const certs = useQuery({ queryKey: keys.admin(backend.path, 'certs'), queryFn: () => api.certInfo(backend.path) });

  return (
    <div className="screen">
      {running ? (
        definition.isError ? (
          <ErrorNote error={definition.error} />
        ) : definition.data === undefined ? (
          <p className="muted">Loading the settings…</p>
        ) : (
          <>
            <SettingsServer key={JSON.stringify([definition.data.port, definition.data.https])} backend={backend} definition={definition.data} certs={certs.data} />
            <SettingsNetwork key={JSON.stringify([definition.data.latency, definition.data.network, definition.data.testMode])} backend={backend} definition={definition.data} />
            <SettingsResponses key={JSON.stringify([definition.data.responses, definition.data.responseTemplates])} backend={backend} definition={definition.data} />
          </>
        )
      ) : (
        <EmptyState>Start the backend on the Dashboard tab to change its port, HTTPS and token settings.</EmptyState>
      )}
      <SettingsCertificates backend={backend} certs={certs.data} />
      <SettingsTools backend={backend} onOpen={onOpen} />
    </div>
  );
}
