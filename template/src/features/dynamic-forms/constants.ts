import type { SpacingKey } from '@theme/index';

/** Gap between fields when a builder gets no `spacing`. */
export const DEFAULT_SPACING: SpacingKey = 'lg';

/** Debounce before a single-page form writes its draft. */
export const DEFAULT_DRAFT_DEBOUNCE_MS = 500;

/** A draft older than this is ignored and deleted (7 days). */
export const DEFAULT_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Version stamped on saved drafts; a different version is ignored, never migrated. */
export const DRAFT_VERSION = 1;

/** A draft key is a short, lowercase, storage-safe name. */
export const DRAFT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Field types whose value is never saved in a draft, whatever `sensitive` says. */
export const NON_PERSISTED_TYPES: ReadonlySet<string> = new Set(['file', 'multiFile']);

/** Field types that are sensitive unless the config says otherwise. */
export const SENSITIVE_BY_DEFAULT_TYPES: ReadonlySet<string> = new Set(['otp']);
