import axios, { type InternalAxiosRequestConfig } from 'axios';

import { ENV, isProd } from '@config/env';
import { i18n } from '@services/i18n/i18n';
import { tokenStore } from '@services/secure-storage/tokenStore';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

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
