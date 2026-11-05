import type { InternalAxiosRequestConfig } from 'axios';

/**
 * Request paths whose 401 is a plain answer (bad credentials, bad code), not an expired session:
 * it is normalized and rejected without a refresh or a sign-out. Matched exactly, on the path
 * alone, so `/auth/login-history` is not skipped.
 */
export const SKIP_REFRESH_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/refresh',
  '/auth/otp/verify',
  '/auth/otp/resend',
  '/auth/forgot-password',
];

const ORIGIN = /^[a-z][\d+.a-z-]*:\/\/[^/]+/i;

function stripQueryAndHash(url: string): string {
  const cut = [url.indexOf('?'), url.indexOf('#')].filter((index) => index >= 0);
  return cut.length > 0 ? url.slice(0, Math.min(...cut)) : url;
}

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return url.slice(0, end);
}

/** Reduces a request URL to its path: no origin, no base URL, no query string, no hash. */
export function toRequestPath(url: string, baseURL?: string): string {
  const withoutQuery = stripQueryAndHash(url);
  const base = baseURL === undefined ? undefined : stripTrailingSlashes(stripQueryAndHash(baseURL));
  const withoutBase =
    base && withoutQuery.startsWith(base) ? withoutQuery.slice(base.length) : withoutQuery;
  const path = withoutBase.replace(ORIGIN, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/** True when a 401 on this request must not trigger a refresh or a sign-out. */
export function shouldSkipRefresh(
  config: Pick<InternalAxiosRequestConfig, 'url' | 'baseURL' | 'skipAuthRefresh'>,
  skipPaths: readonly string[] = SKIP_REFRESH_PATHS,
): boolean {
  if (config.skipAuthRefresh === true) {
    return true;
  }
  return config.url === undefined
    ? false
    : skipPaths.includes(toRequestPath(config.url, config.baseURL));
}
