import { Linking } from 'react-native';

import { ENV } from '@config/env';
import { logger } from '@services/logger/logger';

/** Longest `data.link` we look at; anything longer is not a path of this app. */
const MAX_LINK_LENGTH = 200;
/** Relative path segments of letters, digits, `-` and `_`, e.g. `items/5` or `settings/theme`. */
const PATH_PATTERN = /^[\w-]+(?:\/[\w-]+)*$/;

/** Decides whether a path belongs to this app; the app passes its linking config in. */
export type PushPathValidator = (path: string) => boolean;

let isKnownPath: PushPathValidator | undefined;
let queued: string[] = [];
let isReady = false;

/** Registers the check for known paths. Until it is set, every link is refused. */
export function setPushPathValidator(validator: PushPathValidator): void {
  isKnownPath = validator;
}

/**
 * Reads `data.link` of a message. Only a relative path of this app is accepted (no scheme, host,
 * query or `..`); the path is checked against the app's own linking config. Anything else is
 * ignored with a warning that names no payload value.
 */
export function parsePushLink(data: Readonly<Record<string, unknown>> | undefined): string | null {
  const link: unknown = data?.link;
  if (link === undefined || link === null || link === '') {
    return null;
  }
  const path = typeof link === 'string' ? link.replace(/^\/+/, '') : '';
  if (path.length === 0 || path.length > MAX_LINK_LENGTH || !PATH_PATTERN.test(path)) {
    logger.warn('Push: ignored a link that is not a path of this app');
    return null;
  }
  if (isKnownPath?.(path) !== true) {
    logger.warn('Push: ignored a link to an unknown path');
    return null;
  }
  return path;
}

/** Opens a validated path through the deep link pipeline (signed-out users get it parked). */
function open(path: string): void {
  Linking.openURL(`${ENV.DEEP_LINK_SCHEME}://${path}`).catch((error: unknown) => {
    // Not the error itself: its message repeats the url.
    logger.warn('Push: could not open a link', error instanceof Error ? error.name : typeof error);
  });
}

/**
 * Opens a path from a notification. Before the navigator is mounted (a cold start from a
 * notification) it is kept and opened by `flushPushLinks`.
 */
export function openPushLink(path: string): void {
  if (!isReady) {
    queued.push(path);
    return;
  }
  open(path);
}

/** Call once the navigator is mounted: opens what arrived before and opens the rest at once. */
export function flushPushLinks(): void {
  isReady = true;
  const waiting = queued;
  queued = [];
  // Only the last one counts: a user pressed one notification, a second one replaces the first.
  const last = waiting.at(-1);
  if (last !== undefined) {
    open(last);
  }
}

/** Test helper: forget queued links and the ready flag. */
export function resetPushRouting(): void {
  queued = [];
  isReady = false;
  isKnownPath = undefined;
}
