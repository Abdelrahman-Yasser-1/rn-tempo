import axios, { type AxiosAdapter } from 'axios';

import { ENV } from '@config/env';

import { readApiSource, type ApiSource } from './apiSource';
import { createDevMockAdapter } from './devMockAdapter';

// Dev-only: loaded through a guarded `require` in client.ts, so release bundles never contain it.

/** Whether a request is answered by the in-app mocks, for a source (`env` follows `ENV.API_MOCKING`). */
export function usesMocks(source: ApiSource): boolean {
  return source === 'mocks' || (source === 'env' && ENV.API_MOCKING);
}

/**
 * The axios adapter of dev builds. It picks the in-app mock adapter or the real one from the stored
 * API source on the first request, because storage is not open yet when `client.ts` is imported. The
 * choice then stays for the launch, so a change in the debug menu applies after a restart. While
 * storage is not ready the request follows the build's `env` setting and the choice is not kept.
 */
export function createSwitchingAdapter(): AxiosAdapter {
  // The adapter axios itself would use, so `env` without mocking behaves as before.
  const real = axios.getAdapter(axios.defaults.adapter);
  let mock: AxiosAdapter | undefined;
  let chosen: AxiosAdapter | undefined;

  const mocks = (): AxiosAdapter => (mock ??= createDevMockAdapter());
  const pick = (source: ApiSource): AxiosAdapter => (usesMocks(source) ? mocks() : real);

  return (config) => {
    if (chosen === undefined) {
      let source: ApiSource;
      try {
        source = readApiSource();
      } catch {
        return pick('env')(config);
      }
      chosen = pick(source);
    }
    return chosen(config);
  };
}
