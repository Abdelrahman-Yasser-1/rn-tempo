import axios from 'axios';

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
};

/** The only error type the data layer throws; UI maps `code` to a translated message. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  /** Builds an error from a code and message, plus optional HTTP status and raw details. */
  constructor({ code, message, status, details }: Readonly<ApiErrorInit>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
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

export type ErrorMessageKey =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'validation'
  | 'server'
  | 'unknown';

const MESSAGE_KEYS: Record<ApiErrorCode, ErrorMessageKey> = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'notFound',
  VALIDATION: 'validation',
  SERVER: 'server',
  UNKNOWN: 'unknown',
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

// Keys of the `errors` namespace, declared here so the i18n extractor keeps them.
// t('network', { ns: 'errors', defaultValue: 'No internet connection. Check your network and try again.' })
// t('timeout', { ns: 'errors', defaultValue: 'The request took too long. Please try again.' })
// t('unauthorized', { ns: 'errors', defaultValue: 'Your session has expired. Please sign in again.' })
// t('forbidden', { ns: 'errors', defaultValue: "You don't have permission to do this." })
// t('notFound', { ns: 'errors', defaultValue: "We couldn't find what you were looking for." })
// t('validation', { ns: 'errors', defaultValue: 'Some of the information you entered is invalid.' })
// t('server', { ns: 'errors', defaultValue: 'Something went wrong on our side. Please try again later.' })
// t('unknown', { ns: 'errors', defaultValue: 'Something went wrong. Please try again.' })
