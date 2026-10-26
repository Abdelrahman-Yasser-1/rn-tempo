import { Linking } from 'react-native';

import { ENV, isProd } from '@config/env';
import { useAuthStore } from '@features/auth';

/** Deep link paths of contract C12. Leaf screens reference these from their static `linking`. */
export const LINK_PATHS = {
  Onboarding: 'onboarding',
  Login: 'login',
  Register: 'register',
  ForgotPassword: 'forgot-password',
  Otp: 'otp',
  Home: 'home',
  ItemsList: 'items',
  ItemCreate: 'items/new',
  ItemDetails: 'items/:itemId',
  Profile: 'profile',
  EditProfile: 'profile/edit',
  Settings: 'settings',
  Language: 'settings/language',
  Theme: 'settings/theme',
  About: 'settings/about',
  DebugMenu: 'debug',
} as const;

const AUTH_PATHS = new Set<string>([
  LINK_PATHS.Onboarding,
  LINK_PATHS.Login,
  LINK_PATHS.Register,
  LINK_PATHS.ForgotPassword,
  LINK_PATHS.Otp,
]);

/** `tempo-dev://` plus `https://<host>` when a host is configured. */
export const linkingPrefixes: string[] = [
  `${ENV.DEEP_LINK_SCHEME}://`,
  ...(ENV.DEEP_LINK_HOST === '' ? [] : [`https://${ENV.DEEP_LINK_HOST}`]),
];

/** Strips a known prefix and the query string; returns the bare path (`settings/theme`). */
export function toPath(url: string): string | null {
  const prefix = linkingPrefixes.find((candidate) => url.startsWith(candidate));
  if (prefix === undefined) {
    return null;
  }
  const [withoutQuery = ''] = url.slice(prefix.length).split(/[?#]/);
  return withoutQuery
    .split('/')
    .filter((segment) => segment !== '')
    .join('/');
}

/** Whether a path is reachable while signed out (auth screens and the empty root path). */
export function isPublicPath(path: string): boolean {
  return path === '' || AUTH_PATHS.has(path);
}

/**
 * Applies the protected-link policy to an incoming URL: when signed out, a protected link is parked
 * in `pendingLink` and `null` is returned so the user lands on Login instead.
 */
export function interceptLink(url: string | null | undefined): string | null {
  if (url === null || url === undefined) {
    return null;
  }
  const { status, setPendingLink } = useAuthStore.getState();
  if (status === 'signedIn') {
    return url;
  }
  const path = toPath(url);
  if (path === null || isPublicPath(path)) {
    return url;
  }
  // The debug menu only exists in non-prod builds; ignore it elsewhere rather than parking it.
  if (path === LINK_PATHS.DebugMenu && isProd) {
    return null;
  }
  setPendingLink(url);
  return null;
}

// React Navigation's own "open this URL" callback, captured in `subscribe` so a parked link can be
// replayed through the normal deep link pipeline once the user signs in.
let emitLink: ((url: string) => void) | undefined;

/** Replays the parked deep link, if any. Returns whether one was emitted. */
export function resumePendingLink(): boolean {
  const { pendingLink, setPendingLink } = useAuthStore.getState();
  if (pendingLink === null || emitLink === undefined) {
    return false;
  }
  setPendingLink(null);
  emitLink(pendingLink);
  return true;
}

let stopResuming: (() => void) | undefined;

/**
 * Starts replaying the parked link whenever the session becomes `signedIn`. The replay is deferred
 * one macrotask so the protected navigator group has mounted. Idempotent; returns a stop function.
 */
export function startPendingLinkResume(): () => void {
  stopResuming ??= useAuthStore.subscribe((state, previous) => {
    if (state.status === 'signedIn' && previous.status !== 'signedIn') {
      setTimeout(resumePendingLink, 0);
    }
  });
  return () => {
    stopResuming?.();
    stopResuming = undefined;
  };
}

/** Linking options for the static `Navigation` component (paths come from each screen's `linking`). */
export const linking = {
  enabled: true,
  prefixes: linkingPrefixes,
  async getInitialURL(): Promise<string | null> {
    return interceptLink(await Linking.getInitialURL());
  },
  subscribe(listener: (url: string) => void): () => void {
    emitLink = listener;
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const next = interceptLink(url);
      if (next !== null) {
        listener(next);
      }
    });
    return () => {
      emitLink = undefined;
      subscription.remove();
    };
  },
} as const;
