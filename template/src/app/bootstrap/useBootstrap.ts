import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@features/auth';
import { setUnauthorizedHandler } from '@services/http/client';

import { runBootstrap, type BlockReason, type BootstrapResult } from './bootstrap';
import type { SecurityReason } from './securityStore';

export type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'blocked'; blockReason: BlockReason; securityReasons?: SecurityReason[] };

/** Runs the startup sequence once and exposes its outcome; `retry` re-runs it (maintenance screen). */
export function useBootstrap(): BootstrapState & { retry: () => void } {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' });
  const isRunningRef = useRef(false);

  const start = useCallback(() => {
    if (isRunningRef.current) {
      return;
    }
    isRunningRef.current = true;
    setState({ status: 'loading' });
    // A session that cannot be recovered (refresh failed) signs the user out everywhere.
    setUnauthorizedHandler(() => {
      void useAuthStore.getState().signOut();
    });
    const execute = async () => {
      const result: BootstrapResult = await runBootstrap();
      isRunningRef.current = false;
      setState(result);
    };
    void execute();
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  return { ...state, retry: start };
}
