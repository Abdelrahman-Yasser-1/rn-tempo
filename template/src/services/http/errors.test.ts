import { AxiosError, AxiosHeaders } from 'axios';

import { ApiError, getErrorMessageKey, isRetryable, normalizeError } from './errors';

function axiosError(status: number | undefined, data?: unknown, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response =
    status === undefined ? undefined : { status, data, statusText: '', headers: {}, config };
  return new AxiosError('boom', code, config, undefined, response);
}

describe('normalizeError', () => {
  test.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [400, 'VALIDATION'],
    [422, 'VALIDATION'],
    [500, 'SERVER'],
    [503, 'SERVER'],
    [418, 'UNKNOWN'],
  ])('AC-4: HTTP %i maps to %s', (status, code) => {
    const result = normalizeError(axiosError(status, { message: 'server says no' }));

    expect(result).toBeInstanceOf(ApiError);
    expect(result).toMatchObject({ code, status, message: 'server says no' });
  });

  test('AC-4: timeouts map to TIMEOUT for both axios codes', () => {
    expect(normalizeError(axiosError(undefined, undefined, 'ECONNABORTED')).code).toBe('TIMEOUT');
    expect(normalizeError(axiosError(undefined, undefined, 'ETIMEDOUT')).code).toBe('TIMEOUT');
  });

  test('AC-4: a missing response maps to NETWORK', () => {
    expect(normalizeError(axiosError(undefined, undefined, 'ERR_NETWORK')).code).toBe('NETWORK');
  });

  test('falls back to the axios message when the body has none', () => {
    expect(normalizeError(axiosError(500, '<html>')).message).toBe('boom');
  });

  test('passes ApiError through and wraps unknown values', () => {
    const existing = new ApiError({ code: 'FORBIDDEN', message: 'x' });

    expect(normalizeError(existing)).toBe(existing);
    expect(normalizeError(new Error('plain'))).toMatchObject({ code: 'UNKNOWN', message: 'plain' });
    expect(normalizeError('weird')).toMatchObject({ code: 'UNKNOWN' });
  });
});

describe('error helpers', () => {
  test('getErrorMessageKey maps every code to an errors-namespace key', () => {
    expect(getErrorMessageKey(new ApiError({ code: 'NOT_FOUND', message: '' }))).toBe('notFound');
    expect(getErrorMessageKey(axiosError(undefined, undefined, 'ERR_NETWORK'))).toBe('network');
    expect(getErrorMessageKey(null)).toBe('unknown');
  });

  test('isRetryable is true only for transient failures', () => {
    expect(isRetryable(axiosError(503))).toBe(true);
    expect(isRetryable(axiosError(undefined, undefined, 'ECONNABORTED'))).toBe(true);
    expect(isRetryable(axiosError(undefined, undefined, 'ERR_NETWORK'))).toBe(true);
    expect(isRetryable(axiosError(404))).toBe(false);
    expect(isRetryable(axiosError(401))).toBe(false);
    expect(isRetryable(new Error('bug'))).toBe(false);
  });
});
