import { useEffect, useState } from 'react';

import { useClient } from '../client/context';
import type { RequestEntry } from '../client/types';
import { addEntry } from '../lib/requests';

/**
 * The project's live request log. Rust reads the server's event stream (so the project CA is trusted)
 * and re-emits each entry; this hook listens first, then subscribes, so the replayed history is not missed.
 */
export function useRequestLog(project: string) {
  const client = useClient();
  const [entries, setEntries] = useState<RequestEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];
    const start = async () => {
      const offRequest = await client.onRequest((event) => {
        if (event.project === project) setEntries((current) => addEntry(current, event.entry));
      });
      const offState = await client.onEventsState((event) => {
        if (event.project === project) setConnected(event.connected);
      });
      unlisteners.push(offRequest, offState);
      if (cancelled) return;
      await client.subscribeEvents(project);
    };
    start().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => {
      cancelled = true;
      for (const off of unlisteners) off();
      client.unsubscribeEvents(project).catch(() => undefined);
    };
  }, [client, project]);

  return { entries, connected, error, clear: () => setEntries([]) };
}
