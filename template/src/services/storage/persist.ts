import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

import { logger } from '@services/logger/logger';

import { zustandStorage } from './zustandStorage';

/** Turns the persisted state of version `n - 1` into the state of version `n`. */
export type PersistMigration = (state: unknown) => unknown;

export type PersistConfig<State, Persisted = State> = {
  /** Store name; the MMKV key is `zustand.<name>`. */
  name: string;
  /** Current schema version of the persisted slice. Bump it with every shape change. */
  version: number;
  /** Step migrations keyed by their target version: `migrations[2]` upgrades a v1 state to v2. */
  migrations?: Record<number, PersistMigration>;
  /** Persists a slice of the state (leave out actions and derived data). */
  partialize?: (state: State) => Persisted;
};

/** An empty object merges as "nothing persisted", so the store keeps its initial state. */
const DISCARDED: unknown = {};

/**
 * Builds the `persist` options for a store backed by encrypted MMKV. When the persisted version
 * differs from `version`, the step migrations run in order from the persisted version up to the
 * current one. A throwing step, a missing step or a version from the future discards the
 * persisted state (the store starts from its initial state) and logs a warning.
 */
export function createPersistOptions<State, Persisted = State>({
  name,
  version,
  migrations = {},
  partialize,
}: Readonly<PersistConfig<State, Persisted>>): PersistOptions<State, Persisted> {
  const migrate = (persisted: unknown, persistedVersion: number): Persisted => {
    if (persistedVersion === version) {
      // The shape is guaranteed by the version it was written with, never validated here.
      return persisted as Persisted;
    }
    if (persistedVersion > version) {
      logger.warn(`Persisted store "${name}" is newer than the app, discarding it`, {
        persistedVersion,
        version,
      });
      return DISCARDED as Persisted;
    }
    let current = persisted;
    for (let target = persistedVersion + 1; target <= version; target += 1) {
      const step = migrations[target];
      if (!step) {
        logger.warn(
          `Persisted store "${name}" has no migration to v${String(target)}, discarding it`,
        );
        return DISCARDED as Persisted;
      }
      try {
        current = step(current);
      } catch (error) {
        logger.warn(
          `Persisted store "${name}" failed to migrate to v${String(target)}, discarding it`,
          error,
        );
        return DISCARDED as Persisted;
      }
    }
    return current as Persisted;
  };

  return {
    name,
    storage: createJSONStorage(() => zustandStorage),
    version,
    migrate,
    ...(partialize ? { partialize } : {}),
  };
}
