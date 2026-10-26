import { create } from 'zustand';

import { isProd } from '@config/env';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { FLAG_DEFAULTS, type FlagKey } from './flags';

// Bumped on every change so subscribed hooks re-read MMKV. The values themselves live in MMKV.
const useRevisionStore = create<{ revision: number }>(() => ({ revision: 0 }));

/** Subscribes a component to override changes. */
export function useFlagOverrideRevision(): number {
  return useRevisionStore((state) => state.revision);
}

const keyOf = (flag: FlagKey): string => `${STORAGE_KEYS.flagOverridePrefix}${flag}`;

/** The debug-menu override for a flag; always `undefined` in prod builds. */
export function getFlagOverride(flag: FlagKey): boolean | undefined {
  return isProd ? undefined : storage.getBoolean(keyOf(flag));
}

/** Sets (or, with `undefined`, clears) a local override. No-op in prod builds. */
export function setFlagOverride(flag: FlagKey, isEnabled: boolean | undefined): void {
  if (isProd) {
    return;
  }
  if (isEnabled === undefined) {
    storage.remove(keyOf(flag));
  } else {
    storage.setBoolean(keyOf(flag), isEnabled);
  }
  useRevisionStore.setState((state) => ({ revision: state.revision + 1 }));
}

/** Removes every override (debug menu "reset"). */
export function clearFlagOverrides(): void {
  for (const flag of Object.keys(FLAG_DEFAULTS) as FlagKey[]) {
    storage.remove(keyOf(flag));
  }
  useRevisionStore.setState((state) => ({ revision: state.revision + 1 }));
}
