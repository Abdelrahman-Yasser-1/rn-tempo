import { startNetworkLogging } from 'react-native-network-logger';

import { isProd } from '@config/env';
import { sensitiveEndpointPatterns } from '@services/http/sensitiveEndpoints';

/**
 * Noise in the viewer: Metro traffic (bundles, symbolication, the dev server status) and NetInfo's
 * reachability pings (`HEAD .../generate_204`), which fire every few seconds.
 */
export const NOISE_IGNORED_PATTERNS: readonly RegExp[] = [
  /^\w+ \S*\/symbolicate/,
  /^\w+ \S*\.bundle/,
  /^\w+ \S*\/(status|message|hot)(\?|$)/,
  /^HEAD \S*\/generate_204(\?|$)/,
];

const MAX_LOGGED_REQUESTS = 200;

/** Requests the viewer never records: Metro and reachability noise plus the shared sensitive-endpoint list. */
export function networkLogIgnoredPatterns(): RegExp[] {
  return [...NOISE_IGNORED_PATTERNS, ...sensitiveEndpointPatterns()];
}

/**
 * Non-prod only: records requests (axios rides on XHR) for the network log screen. Call it once,
 * before the first request; it never runs when `isProd`.
 *
 * react-native-network-logger 3.0.0 has no hook to transform what it stores, only ignore lists
 * (`ignoredHosts`, `ignoredUrls`, `ignoredPatterns`). Sensitive endpoints are therefore not
 * recorded at all, but every other request is shown as sent, `Authorization` header included.
 */
export function startNetworkLogger(): void {
  if (isProd) {
    return;
  }
  startNetworkLogging({
    maxRequests: MAX_LOGGED_REQUESTS,
    ignoredPatterns: networkLogIgnoredPatterns(),
  });
}
