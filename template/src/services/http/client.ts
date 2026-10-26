import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { z } from 'zod';

import { ENV, isProd } from '@config/env';
import { i18n } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
// @tempo-feature:ssl-pinning:start
import { isPinningReady } from '@services/security/pinning/pinning';
// @tempo-feature:ssl-pinning:end
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { normalizeError } from './errors';
import { createRequestId } from './requestId';

let resolvedBaseUrl: string | undefined;

/** Debug-menu override (non-prod only) falling back to `ENV.API_BASE_URL`; read once per launch. */
export function resolveBaseUrl(): string {
  if (resolvedBaseUrl) {
    return resolvedBaseUrl;
  }
  if (!isProd) {
    try {
      const override = storage.getString(STORAGE_KEYS.apiBaseUrlOverride);
      if (override) {
        resolvedBaseUrl = override;
        return override;
      }
    } catch {
      // Storage not ready yet: use the env URL for now and look again on the next request.
      return ENV.API_BASE_URL;
    }
  }
  resolvedBaseUrl = ENV.API_BASE_URL;
  return resolvedBaseUrl;
}

/** Test helper: forget the cached base URL. */
export function resetBaseUrlCache(): void {
  resolvedBaseUrl = undefined;
}

/**
 * Dev builds with `API_MOCKING=true` answer from the shared mock route table instead of the
 * network. The `require` sits inside the `__DEV__` branch, which Metro folds away in release
 * bundles, so the adapter and its routes never ship.
 */
function resolveAdapter(): AxiosAdapter | undefined {
  // Keep the `require` directly inside this exact `if`: Metro only folds `__DEV__` conditions in
  // this shape, and a release bundle must not contain the adapter or its routes.
  if (__DEV__ && ENV.API_MOCKING) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded require keeps the mock adapter out of release bundles
    const { createDevMockAdapter } = require('./devMockAdapter') as {
      createDevMockAdapter: () => AxiosAdapter;
    };
    return createDevMockAdapter();
  }
  return undefined;
}

const adapter = resolveAdapter();

/** The app's axios instance: auth, language and correlation headers are added per request. */
export const httpClient = axios.create({
  baseURL: ENV.API_BASE_URL,
  timeout: ENV.API_TIMEOUT_MS,
  adapter,
});

// @tempo-feature:ssl-pinning:start
/** Throws while pinning is enforced but not yet initialized; shared by every outgoing client. */
function assertPinningReady(): void {
  if (ENV.SSL_PINNING_ENABLED && !isPinningReady()) {
    // Closes the race where a request fires before pinning is enforced during bootstrap.
    throw new Error('CERT_PINNING_NOT_READY: request blocked until SSL pinning is initialized');
  }
}
// @tempo-feature:ssl-pinning:end

/** Adds base URL, Authorization, Accept-Language and x-request-id to an outgoing request. */
export function decorateRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // @tempo-feature:ssl-pinning:start
  assertPinningReady();
  // @tempo-feature:ssl-pinning:end
  config.baseURL = resolveBaseUrl();
  const accessToken = tokenStore.getAccessToken();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  config.headers.set('Accept-Language', i18n.language);
  config.headers.set('x-request-id', createRequestId());
  return config;
}

httpClient.interceptors.request.use(decorateRequest);

declare module 'axios' {
  // Module augmentation requires `interface`; marks a request that was already replayed once.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- required by axios typing contract
  interface InternalAxiosRequestConfig {
    isRetry?: boolean;
  }
}

const REFRESH_PATH = '/auth/refresh';
const RefreshResponseSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });

// A bare instance: sharing httpClient would re-enter these interceptors and could loop.
const refreshClient = axios.create({ timeout: ENV.API_TIMEOUT_MS, adapter });

// @tempo-feature:ssl-pinning:start
// Refresh must not leave the device before pinning is enforced, but it gets no Authorization header.
refreshClient.interceptors.request.use((config) => {
  assertPinningReady();
  return config;
});
// @tempo-feature:ssl-pinning:end

let unauthorizedHandler: (() => void) | undefined;

/** Registers what happens when the session cannot be recovered (bootstrap wires `signOut`). */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

type RefreshOutcome =
  | { kind: 'ok' }
  // The session is gone: the refresh token was rejected or the reply is unusable.
  | { kind: 'expired' }
  // The session may still be valid: keep it and let the caller retry later.
  | { kind: 'transient'; error: unknown };

// Statuses that mean the server no longer accepts the refresh token.
const DEFINITIVE_REFRESH_STATUSES = new Set([400, 401, 403]);

function isDefinitiveRefreshFailure(error: unknown): boolean {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && DEFINITIVE_REFRESH_STATUSES.has(status);
}

async function performRefresh(): Promise<RefreshOutcome> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    return { kind: 'expired' };
  }
  let data: unknown;
  try {
    const response = await refreshClient.post(
      REFRESH_PATH,
      { refreshToken },
      { baseURL: resolveBaseUrl() },
    );
    data = response.data;
  } catch (error) {
    // No response (offline, timeout) or a 5xx says nothing about the session itself.
    return isDefinitiveRefreshFailure(error) ? { kind: 'expired' } : { kind: 'transient', error };
  }
  const tokens = RefreshResponseSchema.safeParse(data);
  if (!tokens.success) {
    return { kind: 'expired' };
  }
  await tokenStore.setTokens(tokens.data);
  return { kind: 'ok' };
}

let refreshInFlight: Promise<RefreshOutcome> | undefined;

// Single-flight: concurrent 401s all await the same refresh and share its outcome.
function refreshAccessToken(): Promise<RefreshOutcome> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

const BEARER_PREFIX = 'Bearer ';

async function handleUnauthorized(error: unknown): Promise<never> {
  if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
    throw error;
  }
  const config = error.config;
  const sentHeader = config.headers.get('Authorization');
  if (typeof sentHeader !== 'string') {
    // The request was anonymous (e.g. wrong password on login): nothing to refresh.
    throw error;
  }
  if (config.isRetry) {
    // The fresh token was rejected too: the session is gone.
    unauthorizedHandler?.();
    throw error;
  }

  const currentToken = tokenStore.getAccessToken();
  const sentToken = sentHeader.slice(BEARER_PREFIX.length);
  // Another request may already have refreshed while this one was in flight.
  if (currentToken === null || currentToken === sentToken) {
    const outcome = await refreshAccessToken();
    if (outcome.kind === 'expired') {
      unauthorizedHandler?.();
      throw error;
    }
    if (outcome.kind === 'transient') {
      // Rejecting with the refresh error keeps the tokens; the final interceptor normalizes it.
      throw outcome.error;
    }
  }
  config.isRetry = true;
  return httpClient.request(config);
}

httpClient.interceptors.response.use((response) => response, handleUnauthorized);

// Registered last so refresh logic sees raw axios errors; callers only ever see ApiError.
httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    throw normalizeError(error);
  },
);
