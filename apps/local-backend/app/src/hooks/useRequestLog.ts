import { useEffect, useState } from 'react';

import { useApi } from '../api/context';
import type { RequestEntry } from '../api/types';
import { addEntry } from '../lib/requests';

/**
 * A backend's live request log. Rust reads the engine's event stream and re-emits each entry; this hook listens
 * first, then subscribes, so the replayed history is not missed.
 */
export function useRequestLog(backend: string) {
  const api = useApi();
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const offs: (() => void)[] = [];
    const start = async () => {
      const offRequest = await api.onRequest((event) => {
        if (event.backend === backend) setEntries((current) => addEntry(current, event.entry));
      });
      const offState = await api.onEventsState((event) => {
        if (event.backend === backend) setConnected(event.connected);
      });
      offs.push(offRequest, offState);
      if (cancelled) return;
      await api.subscribeRequests(backend);
    };
    start().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => {
      cancelled = true;
      for (const off of offs) off();
      api.unsubscribeRequests(backend).catch(() => undefined);
    };
  }, [api, backend]);

  return {
    entries,
    connected,
    error,
    clear: () => {
      setEntries([]);
    },
  };
}
