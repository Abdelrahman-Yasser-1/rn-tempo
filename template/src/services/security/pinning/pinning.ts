// @tempo-feature:ssl-pinning:start
import {
  addSslPinningErrorListener,
  initializeSslPinning,
  isSslPinningAvailable,
} from 'react-native-ssl-public-key-pinning';

import { ENV, isProd } from '@config/env';
import { logger } from '@services/logger/logger';

export type PinningOptions = {
  /** Called when the server presents a key that matches none of the pins (possible MITM). */
  onSecurityCompromised: (reason: 'ssl') => void;
};

let isReady = false;
let pendingInit: Promise<boolean> | undefined;

/** True once pinning is enforced (or deliberately off in a non-prod build). Gates every request. */
export function isPinningReady(): boolean {
  return isReady;
}

const PIN_PREFIX = 'sha256/';
const HOSTNAME_PATTERN = /^https?:\/\/([^/:?#]+)/;

const normalizePin = (pin: string): string =>
  pin.startsWith(PIN_PREFIX) ? pin.slice(PIN_PREFIX.length) : pin;

async function setup({ onSecurityCompromised }: Readonly<PinningOptions>): Promise<boolean> {
  if (!ENV.SSL_PINNING_ENABLED) {
    if (isProd) {
      // Fail closed: a prod build must never talk to the network unpinned.
      logger.error('SSL pinning is disabled in a prod build; blocking startup');
      return false;
    }
    isReady = true;
    return true;
  }
  if (!isSslPinningAvailable()) {
    logger.error('SSL pinning native module is unavailable');
    return false;
  }
  const hostname = HOSTNAME_PATTERN.exec(ENV.API_BASE_URL)?.[1];
  if (!hostname) {
    logger.error('SSL pinning cannot determine the API hostname', ENV.API_BASE_URL);
    return false;
  }
  try {
    await initializeSslPinning({
      [hostname]: { includeSubdomains: true, publicKeyHashes: ENV.SSL_PINS.map(normalizePin) },
    });
  } catch (error) {
    logger.error('SSL pinning failed to initialize', error);
    return false;
  }
  addSslPinningErrorListener((error) => {
    logger.error('SSL pin mismatch', error.serverHostname, error.message);
    onSecurityCompromised('ssl');
  });
  isReady = true;
  return true;
}

/**
 * Enables SPKI pinning for the API host. Resolves `false` when startup must be blocked
 * (prod without pinning, or pinning failing); concurrent calls share one initialisation.
 */
export function initPinning(options: Readonly<PinningOptions>): Promise<boolean> {
  if (isReady) {
    return Promise.resolve(true);
  }
  pendingInit ??= setup(options).finally(() => {
    pendingInit = undefined;
  });
  return pendingInit;
}
// @tempo-feature:ssl-pinning:end
