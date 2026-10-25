import axios, { type InternalAxiosRequestConfig } from 'axios';
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

/** The app's axios instance: auth, language and correlation headers are added per request. */
export const httpClient = axios.create({ baseURL: ENV.API_BASE_URL, timeout: ENV.API_TIMEOUT_MS });

/** Adds base URL, Authorization, Accept-Language and x-request-id to an outgoing request. */
export function decorateRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  // @tempo-feature:ssl-pinning:start
  if (ENV.SSL_PINNING_ENABLED && !isPinningReady()) {
    // Closes the race where a request fires before pinning is enforced during bootstrap.
    throw new Error('CERT_PINNING_NOT_READY: request blocked until SSL pinning is initialized');
  }
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
const refreshClient = axios.create({ timeout: ENV.API_TIMEOUT_MS });

let unauthorizedHandler: (() => void) | undefined;

/** Registers what happens when the session cannot be recovered (bootstrap wires `signOut`). */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    return null;
  }
  try {
    const response = await refreshClient.post(
      REFRESH_PATH,
      { refreshToken },
      { baseURL: resolveBaseUrl() },
    );
    const tokens = RefreshResponseSchema.parse(response.data);
    await tokenStore.setTokens(tokens);
    return tokens.accessToken;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<string | null> | undefined;

// Single-flight: concurrent 401s all await the same refresh instead of each starting one.
function refreshAccessToken(): Promise<string | null> {
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
  const nextToken =
    currentToken !== null && currentToken !== sentToken ? currentToken : await refreshAccessToken();
  if (!nextToken) {
    unauthorizedHandler?.();
    throw error;
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
