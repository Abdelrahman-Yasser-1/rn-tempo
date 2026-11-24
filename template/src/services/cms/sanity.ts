import type { CmsClient } from './types';

/** Rejects reads until the sanity adapter ships in T16.E2. */
function notImplemented(): Promise<never> {
  return Promise.reject(new Error('CMS sanity adapter is not implemented'));
}

export const sanityClient: CmsClient = { getEntries: notImplemented, getEntry: notImplemented };
