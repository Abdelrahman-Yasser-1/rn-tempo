import { useState } from 'react';

import { AdminError } from '../api/client';
import type { Loss } from '../api/types';
import { errorMessage } from '../lib/errors';

/**
 * A change that may delete data. The first try goes without `confirm`. When the engine answers 409 with what would
 * be lost, `lost` is set and the UI asks again; `confirm()` then repeats the change with `confirm=true`.
 */
export function useLossFlow(run: (confirm: boolean) => Promise<unknown>, onDone: () => void) {
  const [lost, setLost] = useState<{ message: string; items: Loss[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = async (confirm: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await run(confirm);
      setLost(null);
      onDone();
    } catch (failure) {
      if (!confirm && failure instanceof AdminError && failure.confirmRequired) setLost({ message: failure.message, items: failure.lost ?? [] });
      else {
        setLost(null);
        setError(errorMessage(failure));
      }
    } finally {
      setBusy(false);
    }
  };

  return {
    lost,
    error,
    busy,
    start: () => attempt(false),
    confirm: () => attempt(true),
    cancel: () => {
      setLost(null);
    },
  };
}
