import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { z } from 'zod';

import { getOrCreateEncryptionKey } from './encryptionKey';
import { STORAGE_ID } from './keys';

/** Thrown when storage is used before `initStorage()` resolved. */
export class StorageNotReadyError extends Error {
  /** Creates the error with the standard guidance message. */
  constructor() {
    super('Storage accessed before initStorage() resolved. Await initStorage() during bootstrap.');
    this.name = 'StorageNotReadyError';
  }
}

let instance: MMKV | undefined;
let pendingInit: Promise<void> | undefined;

async function createInstance(): Promise<void> {
  try {
    const encryptionKey = await getOrCreateEncryptionKey();
    instance = createMMKV({ id: STORAGE_ID, encryptionKey, encryptionType: 'AES-256' });
  } catch (error) {
    // Allow a retry after a transient keychain failure.
    pendingInit = undefined;
    throw error;
  }
}

/** Creates the encrypted MMKV instance; the key comes from the keychain, so this is async. Idempotent. */
export function initStorage(): Promise<void> {
  if (instance) {
    return Promise.resolve();
  }
  pendingInit ??= createInstance();
  return pendingInit;
}

function getInstance(): MMKV {
  if (!instance) {
    throw new StorageNotReadyError();
  }
  return instance;
}

/** Reads a string value. */
function getString(key: string): string | undefined {
  return getInstance().getString(key);
}

/** Writes a string value. */
function setString(key: string, text: string): void {
  getInstance().set(key, text);
}

/** Reads a boolean value. */
function getBoolean(key: string): boolean | undefined {
  return getInstance().getBoolean(key);
}

/** Writes a boolean value. */
function setBoolean(key: string, isEnabled: boolean): void {
  getInstance().set(key, isEnabled);
}

/** Reads JSON and validates it; corrupt or schema-mismatched data yields `undefined`. */
function getJSON<T>(key: string, schema: z.ZodType<T>): T | undefined {
  const raw = getInstance().getString(key);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Serializes any JSON-compatible value. */
function setJSON(key: string, payload: unknown): void {
  getInstance().set(key, JSON.stringify(payload));
}

/** Deletes one key. */
function remove(key: string): void {
  getInstance().remove(key);
}

/** Deletes every key (debug menu, sign-out of the whole app). */
function clearAll(): void {
  getInstance().clearAll();
}

/** Typed facade over the encrypted MMKV instance; throws `StorageNotReadyError` before init. */
export const storage = {
  getString,
  setString,
  getBoolean,
  setBoolean,
  getJSON,
  setJSON,
  remove,
  clearAll,
};

/** The raw MMKV instance for dev tooling (Rozenite inspector). Do not use for app data. */
export function getStorageForDevTools(): MMKV {
  return getInstance();
}
