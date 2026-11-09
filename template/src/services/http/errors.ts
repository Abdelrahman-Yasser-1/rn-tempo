import axios from 'axios';
import { keyFromSelector } from 'i18next';
import type { SelectorKey } from 'i18next';

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'SERVER'
  | 'UNKNOWN';

export type ApiErrorInit = {
  code: ApiErrorCode;
  message: string;
  status?: number;
  details?: unknown;
  /** Overrides the default, see `ApiError.isOperational`. */
  isOperational?: boolean;
};

/** Network, timeout, 4xx and 5xx are expected at runtime; an unexpected shape or error is a bug. */
function isOperationalByDefault(code: ApiErrorCode, status: number | undefined): boolean {
  return code !== 'UNKNOWN' || (status !== undefined && status < 500);
}

/** The only error type the data layer throws; UI maps `code` to a translated message. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;
  /**
   * True for expected runtime failures (offline, timeout, 4xx, 5xx): log at `warn`. False for
   * programmer or contract bugs (a response that does not match its schema): log at `error`.
   */
  readonly isOperational: boolean;

  /** Builds an error from a code and message, plus optional HTTP status and raw details. */
  constructor({ code, message, status, details, isOperational }: Readonly<ApiErrorInit>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.isOperational = isOperational ?? isOperationalByDefault(code, status);
  }
}

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 400 || status === 422) {
    return 'VALIDATION';
  }
  return status >= 500 ? 'SERVER' : 'UNKNOWN';
}

function serverMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }
  const message: unknown = Reflect.get(data, 'message');
  return typeof message === 'string' ? message : undefined;
}

/** Converts anything thrown by the HTTP layer into an `ApiError`. */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const { status } = error.response;
      const data: unknown = error.response.data;
      return new ApiError({
        code: codeForStatus(status),
        status,
        message: serverMessage(data) ?? error.message,
        details: data,
      });
    }
    // No response: a timeout, or offline / DNS / TLS failure / dropped connection.
    const isTimeout = error.code !== undefined && TIMEOUT_CODES.has(error.code);
    return new ApiError({ code: isTimeout ? 'TIMEOUT' : 'NETWORK', message: error.message });
  }
  return new ApiError({
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}

/** Key inside the `errors` namespace, built with `keyFromSelector` so it is typed and extracted. */
export type ErrorMessageKey = SelectorKey;

const MESSAGE_KEYS: Record<ApiErrorCode, ErrorMessageKey> = {
  NETWORK: keyFromSelector(($) => $.network, { ns: 'errors' }),
  TIMEOUT: keyFromSelector(($) => $.timeout, { ns: 'errors' }),
  UNAUTHORIZED: keyFromSelector(($) => $.unauthorized, { ns: 'errors' }),
  FORBIDDEN: keyFromSelector(($) => $.forbidden, { ns: 'errors' }),
  NOT_FOUND: keyFromSelector(($) => $.notFound, { ns: 'errors' }),
  VALIDATION: keyFromSelector(($) => $.validation, { ns: 'errors' }),
  SERVER: keyFromSelector(($) => $.server, { ns: 'errors' }),
  UNKNOWN: keyFromSelector(($) => $.unknown, { ns: 'errors' }),
};

/** Key inside the `errors` namespace: `t(getErrorMessageKey(error), { ns: 'errors' })`. */
export function getErrorMessageKey(error: unknown): ErrorMessageKey {
  return MESSAGE_KEYS[normalizeError(error).code];
}

/** Whether retrying the same request can plausibly succeed (transient failures only). */
export function isRetryable(error: unknown): boolean {
  const { code } = normalizeError(error);
  return code === 'NETWORK' || code === 'TIMEOUT' || code === 'SERVER';
}
