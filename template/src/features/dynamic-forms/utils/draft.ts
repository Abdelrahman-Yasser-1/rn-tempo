import { get, set } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import { useAuthStore } from '@features/auth';
import {
  DEFAULT_DRAFT_MAX_AGE_MS,
  DRAFT_KEY_PATTERN,
  DRAFT_VERSION,
} from '@features/dynamic-forms/constants';
import type { FormField } from '@features/dynamic-forms/types';
import { getValueFields, isNeverPersisted } from '@features/dynamic-forms/utils/fieldTree';
import { logger } from '@services/logger/logger';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

const draftSchema = z.object({
  v: z.literal(DRAFT_VERSION),
  /** Index of the step the user was on (multi-step forms). */
  step: z.number().int().min(0).optional(),
  savedAt: z.number(),
  /** Id of the user who saved it, or null when nobody was signed in. */
  owner: z.string().nullable(),
  values: z.record(z.string(), z.unknown()),
});

export type Draft = z.infer<typeof draftSchema>;

function currentOwner(): string | null {
  const { status, user } = useAuthStore.getState();
  return status === 'signedIn' && user ? String(user.id) : null;
}

const indexSchema = z.array(z.string());

function addToIndex(name: string): void {
  const names = storage.getJSON(STORAGE_KEYS.formsDraftIndex, indexSchema) ?? [];
  if (!names.includes(name)) {
    storage.setJSON(STORAGE_KEYS.formsDraftIndex, [...names, name]);
  }
}

/** Deletes every saved draft (sign-out, or another user signing in). */
export function clearAllDrafts(): void {
  epoch += 1;
  try {
    for (const name of storage.getJSON(STORAGE_KEYS.formsDraftIndex, indexSchema) ?? []) {
      storage.remove(name);
    }
    storage.remove(STORAGE_KEYS.formsDraftIndex);
  } catch {
    logger.warn('dynamic-forms: drafts could not be cleared');
  }
}

/** Bumped by every cleanup; a save that captured an older epoch is a no-op. */
let epoch = 0;

/** Who a form saves its draft for: the signed-in user and the cleanup epoch at mount time. */
export type DraftSession = Readonly<{ owner: string | null; epoch: number }>;

/** Captures the session to pass to `saveDraft`; `owner` is `null` when nobody is signed in. */
export function getDraftSession(): DraftSession {
  const { status, user } = useAuthStore.getState();
  return { owner: status === 'signedIn' && user ? String(user.id) : null, epoch };
}

/**
 * Clears all drafts when the signed-in user signs out or changes. Call it once at app start
 * (the app registers it in `App.tsx`); it returns the unsubscribe function.
 */
export function initDraftCleanup(): () => void {
  return useAuthStore.subscribe((state, previous) => {
    if (previous.user !== null && previous.user.id !== state.user?.id) {
      clearAllDrafts();
    }
  });
}

function storageKey(key: string): string | undefined {
  return DRAFT_KEY_PATTERN.test(key) ? `${STORAGE_KEYS.formsDraftPrefix}${key}` : undefined;
}

/**
 * The part of `values` that may be saved: only fields declared in the config, and never a
 * sensitive field or a file field (also inside repeat items). Everything else is dropped.
 */
export function pickPersistableValues<T extends FieldValues>(
  fields: readonly FormField<T>[],
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of getValueFields(fields)) {
    if (field.type === 'repeat') {
      const items: unknown = get(values, field.name);
      const keep = field.fields.filter((child) => !isNeverPersisted(child));
      if (Array.isArray(items)) {
        const kept = items.map((item: unknown) =>
          Object.fromEntries(keep.map((child) => [child.name, get(item, child.name)])),
        );
        set(picked, field.name, kept);
      }
    } else if (!isNeverPersisted(field)) {
      const value: unknown = get(values, field.name);
      if (value !== undefined) {
        set(picked, field.name, value);
      }
    }
  }
  return picked;
}

/** Deep merge for plain objects (arrays and primitives in `override` replace `base`). */
export function mergeValues<T extends object>(
  base: Partial<T> | undefined,
  override: Readonly<Record<string, unknown>> | undefined,
): Partial<T> | undefined {
  if (override === undefined) {
    return base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [name, value] of Object.entries(override)) {
    const current = result[name];
    const isObject = (item: unknown): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item);
    result[name] = isObject(current) && isObject(value) ? mergeValues(current, value) : value;
  }
  return result as Partial<T>;
}

/**
 * Reads a saved draft. A missing, corrupt, outdated or unreadable one gives `undefined`; so does
 * one saved by another user (or while signed out when someone is signed in now, or the reverse)
 * or older than `maxAgeMs`, and those are deleted.
 */
export function loadDraft(
  key: string,
  maxAgeMs: number = DEFAULT_DRAFT_MAX_AGE_MS,
): Draft | undefined {
  const name = storageKey(key);
  if (name === undefined) {
    return undefined;
  }
  try {
    const draft = storage.getJSON(name, draftSchema);
    if (
      draft &&
      (draft.owner === null ||
        draft.owner !== currentOwner() ||
        Date.now() - draft.savedAt > maxAgeMs)
    ) {
      storage.remove(name);
      return undefined;
    }
    return draft;
  } catch {
    logger.warn('dynamic-forms: a draft could not be read');
    return undefined;
  }
}

/** Writes the draft of a form (see `pickPersistableValues` for what is kept). */
export function saveDraft<T extends FieldValues>(
  key: string,
  fields: readonly FormField<T>[],
  values: Readonly<Record<string, unknown>>,
  options: Readonly<{ step?: number; session: DraftSession }>,
): void {
  const { step, session } = options;
  const name = storageKey(key);
  if (name === undefined) {
    logger.warn('dynamic-forms: a draft key is not valid, nothing was saved');
    return;
  }
  // A save that outlived its session writes nothing: the user signed out or changed, or a
  // cleanup ran since the form mounted.
  if (session.owner === null || session.owner !== currentOwner() || session.epoch !== epoch) {
    return;
  }
  const draft: Draft = {
    v: DRAFT_VERSION,
    ...(step === undefined ? {} : { step }),
    savedAt: Date.now(),
    owner: session.owner,
    values: pickPersistableValues(fields, values),
  };
  try {
    storage.setJSON(name, draft);
    addToIndex(name);
  } catch {
    logger.warn('dynamic-forms: a draft could not be saved');
  }
}

/** Deletes one saved draft (sign-out already clears all of them). */
export function discardDraft(key: string): void {
  const name = storageKey(key);
  if (name === undefined) {
    return;
  }
  try {
    storage.remove(name);
  } catch {
    logger.warn('dynamic-forms: a draft could not be removed');
  }
}

/** True when a readable draft exists for `key`. */
export function hasDraft(key: string): boolean {
  return loadDraft(key) !== undefined;
}
