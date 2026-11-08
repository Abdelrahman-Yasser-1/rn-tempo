import { areAreasOpen, getArea, getStoragesForDevTools, openAreas } from './areas';
import { getOrCreateEncryptionKey } from './encryptionKey';

export { StorageError, StorageNotReadyError } from './errors';
export { getArea, getStoragesForDevTools };
export type { StorageAreaName } from './areas';

let pendingInit: Promise<void> | undefined;

async function createInstances(): Promise<void> {
  try {
    openAreas(await getOrCreateEncryptionKey());
  } catch (error) {
    // Allow a retry after a transient keychain failure.
    pendingInit = undefined;
    throw error;
  }
}

/** Opens the encrypted MMKV areas; the key comes from the keychain, so this is async. Idempotent. */
export function initStorage(): Promise<void> {
  if (areAreasOpen()) {
    return Promise.resolve();
  }
  pendingInit ??= createInstances();
  return pendingInit;
}

/** Typed facade over the default (`app`) area; throws `StorageNotReadyError` before init. */
export const storage = getArea('app');
