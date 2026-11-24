import type { CmsClient } from './types';

/** Rejects reads until the tempo adapter ships in T16.E2. */
function notImplemented(): Promise<never> {
  return Promise.reject(new Error('CMS tempo adapter is not implemented'));
}

export const tempoClient: CmsClient = { getEntries: notImplemented, getEntry: notImplemented };
