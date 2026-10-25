import type { StateStorage } from 'zustand/middleware';

import { STORAGE_KEYS } from './keys';
import { storage } from './storage';

const keyOf = (name: string): string => `${STORAGE_KEYS.zustandPrefix}${name}`;

/** Reads a persisted store. */
function getItem(name: string): string | null {
  return storage.getString(keyOf(name)) ?? null;
}

/** Persists a serialized store. */
function setItem(name: string, serialized: string): void {
  storage.setString(keyOf(name), serialized);
}

/** Deletes a persisted store. */
function removeItem(name: string): void {
  storage.remove(keyOf(name));
}

/** Zustand `persist` adapter backed by encrypted MMKV, keys prefixed `zustand.`. */
export const zustandStorage: StateStorage = { getItem, setItem, removeItem };
