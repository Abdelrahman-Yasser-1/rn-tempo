import type { MMKV } from 'react-native-mmkv';
import type { z } from 'zod';

/** Typed facade over one MMKV instance; every method resolves the instance on call. */
export function createStorageFacade(getInstance: () => MMKV) {
  return {
    /** Reads a string value. */
    getString: (key: string): string | undefined => getInstance().getString(key),

    /** Writes a string value. */
    setString: (key: string, text: string): void => {
      getInstance().set(key, text);
    },

    /** Reads a boolean value. */
    getBoolean: (key: string): boolean | undefined => getInstance().getBoolean(key),

    /** Writes a boolean value. */
    setBoolean: (key: string, isEnabled: boolean): void => {
      getInstance().set(key, isEnabled);
    },

    /** Reads JSON and validates it; corrupt or schema-mismatched data yields `undefined`. */
    getJSON: <T>(key: string, schema: z.ZodType<T>): T | undefined => {
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
    },

    /** Serializes any JSON-compatible value. */
    setJSON: (key: string, payload: unknown): void => {
      getInstance().set(key, JSON.stringify(payload));
    },

    /** Deletes one key. */
    remove: (key: string): void => {
      getInstance().remove(key);
    },

    /** Deletes every key of this area (debug menu, sign-out of the whole app). */
    clearAll: (): void => {
      getInstance().clearAll();
    },
  };
}

/** The typed storage API of one area. */
export type StorageFacade = ReturnType<typeof createStorageFacade>;
