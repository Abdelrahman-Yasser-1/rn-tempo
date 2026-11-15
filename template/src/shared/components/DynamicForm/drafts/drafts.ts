import { get, set } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import { logger } from '@services/logger/logger';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';
import {
  DEFAULT_DRAFT_MAX_AGE_MS,
  DRAFT_KEY_PATTERN,
  DRAFT_VERSION,
} from '@shared/components/DynamicForm/constants';
import type { FormField } from '@shared/components/DynamicForm/types';
import { getValueFields, isNeverPersisted } from '@shared/components/DynamicForm/utils/fieldTree';

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

/**
 * What the drafts need to know about the signed-in user. The app wires it to its auth store
 * (see `initDraftCleanup`), so this service never imports a feature.
 */
export type DraftAuthSource = Readonly<{
  /** Id of the signed-in user, or `null` when nobody is signed in. */
  getOwner: () => string | null;
  /** Calls `listener(userId, previousUserId)` when the user changes; returns the unsubscribe function. */
  subscribe: (
    listener: (userId: string | null, previousUserId: string | null) => void,
  ) => () => void;
}>;

let authSource: DraftAuthSource | undefined;

/** Nobody counts as signed in until `initDraftCleanup` ran, so nothing is saved or restored. */
function currentOwner(): string | null {
  return authSource?.getOwner() ?? null;
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
    logger.warn('form-drafts: drafts could not be cleared');
  }
}

/** Bumped by every cleanup; a save that captured an older epoch is a no-op. */
let epoch = 0;

/** Who a form saves its draft for: the signed-in user and the cleanup epoch at mount time. */
export type DraftSession = Readonly<{ owner: string | null; epoch: number }>;

/** Captures the session to pass to `saveDraft`; `owner` is `null` when nobody is signed in. */
export function getDraftSession(): DraftSession {
  return { owner: currentOwner(), epoch };
}

/**
 * Connects the drafts to the auth state and clears all of them when the signed-in user signs out
 * or changes. Call it once at app start (the app does it in `App.tsx`, passing its auth store);
 * it returns the unsubscribe function, after which no draft is saved or restored.
 */
export function initDraftCleanup(source: DraftAuthSource): () => void {
  authSource = source;
  const unsubscribe = source.subscribe((userId, previousUserId) => {
    if (previousUserId !== null && previousUserId !== userId) {
      clearAllDrafts();
    }
  });
  return () => {
    unsubscribe();
    if (authSource === source) {
      authSource = undefined;
    }
  };
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
    logger.warn('form-drafts: a draft could not be read');
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
    logger.warn('form-drafts: a draft key is not valid, nothing was saved');
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
    logger.warn('form-drafts: a draft could not be saved');
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
    logger.warn('form-drafts: a draft could not be removed');
  }
}

/** True when a readable draft exists for `key`. */
export function hasDraft(key: string): boolean {
  return loadDraft(key) !== undefined;
}
