import { createLogger, setLogTransport } from './logger';
import { CIRCULAR_MARK, DEPTH_MARK, REDACTED, REQUEST_MARK, redact, redactString } from './redact';

// Built from parts so secret scanners do not flag the fixture.
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'c2lnbmF0dXJl'].join('.');

// Stands in for AxiosHeaders: a class instance, which the redactor would otherwise skip.
class FakeHeaders {
  [name: string]: string;

  constructor(values: Record<string, string>) {
    Object.assign(this, values);
    // Like AxiosHeaders: non-enumerable accessors on a class instance.
    Object.defineProperty(this, 'get', { value: (name: string) => values[name] });
    Object.defineProperty(this, 'toJSON', { value: () => ({ ...values }) });
  }
}

describe('redact', () => {
  test.each([
    'token',
    'accessToken',
    'secret',
    'clientSecret',
    'password',
    'passwd',
    'Authorization',
    'cookie',
    'Set-Cookie',
    'signature',
    'otp',
    'pin',
    'apikey',
    'api_key',
    'refresh',
    'refreshToken',
  ])('replaces the whole value of the key %s', (key) => {
    expect(redact({ [key]: { nested: 'value' } })).toEqual({ [key]: REDACTED });
  });

  test('keeps harmless keys and primitive values', () => {
    expect(redact({ id: 7, name: 'box', ok: true, none: null, missing: undefined })).toEqual({
      id: 7,
      name: 'box',
      ok: true,
      none: null,
      missing: undefined,
    });
  });

  test('masks JWTs, Bearer values and emails inside strings', () => {
    expect(redactString(`got ${JWT} back`)).toBe(`got ${REDACTED} back`);
    expect(redactString('Authorization: Bearer abc.def-123')).toBe(
      `Authorization: Bearer ${REDACTED}`,
    );
    expect(redactString('mail john@example.com now')).toBe('mail j***@example.com now');
  });

  test('redacts strings in arrays and nested objects', () => {
    const input = { list: ['a@b.co', { deep: { note: `Bearer xyz`, token: 'abc' } }] };

    expect(redact(input)).toEqual({
      list: ['a***@b.co', { deep: { note: `Bearer ${REDACTED}`, token: REDACTED } }],
    });
  });

  test('never mutates its input', () => {
    const input = { token: 'abc', list: [{ email: 'a@b.co' }] };
    const snapshot = JSON.stringify(input);

    const output = redact(input);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(output).not.toBe(input);
    expect(output.list).not.toBe(input.list);
  });

  test('redacts the message and stack of an Error and keeps its name', () => {
    const error = new TypeError('bad mail john@example.com');

    const result = redact(error);

    expect(result).toBeInstanceOf(Error);
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('bad mail j***@example.com');
    expect(result.stack).not.toContain('john@example.com');
    expect(error.message).toBe('bad mail john@example.com');
  });

  test('redacts the cause and extra fields of an Error', () => {
    const error = Object.assign(new Error('x', { cause: { token: 't' } }), { password: 'p' });

    const result = redact(error) as Error & { password: string; cause: { token: string } };

    expect(result.password).toBe(REDACTED);
    expect(result.cause).toEqual({ token: REDACTED });
  });

  test('redacts axios errors: headers, request data and response data', () => {
    const config = {
      url: '/auth/login',
      headers: new FakeHeaders({ Authorization: 'Bearer abc', Accept: 'application/json' }),
      data: '{"password":"hunter2"}',
    };
    const error = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      config,
      request: { big: 'xhr' },
      response: {
        status: 401,
        headers: new FakeHeaders({ 'Set-Cookie': 'sid=1' }),
        config,
        data: { accessToken: 'a', message: 'nope' },
      },
    });

    const result = redact(error) as unknown as {
      config: { url: string; data: string; headers: Record<string, unknown> };
      request: unknown;
      response: { status: number; data: unknown; headers: Record<string, unknown> };
    };

    expect(result.config.url).toBe('/auth/login');
    expect(result.config.data).toBe(REDACTED);
    expect(result.config.headers.Authorization).toBe(REDACTED);
    expect(result.config.headers.Accept).toBe('application/json');
    expect(result.request).toBe(REQUEST_MARK);
    expect(result.response.status).toBe(401);
    expect(result.response.data).toBe(REDACTED);
    expect(result.response.headers['Set-Cookie']).toBe(REDACTED);
  });

  test('redacts the nested response.config of an axios error', () => {
    const inner = {
      url: '/auth/refresh',
      headers: new FakeHeaders({ Authorization: 'Bearer x' }),
      data: '{"password":"hunter2","refreshToken":"r"}',
    };
    const error = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      config: { url: '/auth/refresh' },
      response: { status: 401, data: 'nope', config: inner },
    });

    const result = redact(error) as unknown as {
      response: { config: { url: string; data: string; headers: Record<string, unknown> } };
    };
    const serialized = JSON.stringify(result);

    expect(result.response.config.url).toBe('/auth/refresh');
    expect(result.response.config.data).toBe(REDACTED);
    expect(result.response.config.headers.Authorization).toBe(REDACTED);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('Bearer x');
  });

  test('redacts a headers instance nested in a plain object, at any depth', () => {
    const headers = new FakeHeaders({ Authorization: 'Bearer x', Accept: 'json' });

    const result = redact({ a: { b: { headers } } }) as {
      a: { b: { headers: Record<string, unknown> } };
    };

    expect(result.a.b.headers.Authorization).toBe(REDACTED);
    expect(result.a.b.headers.Accept).toBe('json');
  });

  test('keeps Date and RegExp, and redacts inside Map, Set and class instances', () => {
    class Box {
      readonly token = 'secret-value';
      readonly label = 'kept';
    }
    const date = new Date(0);
    const pattern = /x/;

    const result = redact({
      date,
      pattern,
      map: new Map<unknown, unknown>([
        ['token', 'x'],
        ['plain', 'Bearer abc'],
      ]),
      set: new Set(['Bearer abc']),
      box: new Box(),
      binary: new ArrayBuffer(8),
    });

    expect(result.date).toBe(date);
    expect(result.pattern).toBe(pattern);
    expect(result.map).toEqual(
      new Map([
        ['token', REDACTED],
        ['plain', `Bearer ${REDACTED}`],
      ]),
    );
    expect(result.set).toEqual([`Bearer ${REDACTED}`]);
    expect(result.box).toEqual({ token: REDACTED, label: 'kept' });
    expect(result.binary).toEqual({});
  });

  test.each(['x-api-key', 'X-Session-Id', 'sessionId', 'sid', 'credentials', 'private_key'])(
    'redacts the %s key whatever its separators',
    (key) => {
      expect(redact({ [key]: 'value' })).toEqual({ [key]: REDACTED });
    },
  );

  test.each([
    ['https://user:pa55@api.test/x', `https://${REDACTED}@api.test/x`],
    ['GET /cb?code=abc&state=1', `GET /cb?code=${REDACTED}&state=1`],
    ['/reset?token=abc', `/reset?token=${REDACTED}`],
    ['/x?access_token=abc#y', `/x?access_token=${REDACTED}#y`],
    ['/login#id_token=abc&x=1', `/login#id_token=${REDACTED}&x=1`],
    ['/x?api-key=abc', `/x?api-key=${REDACTED}`],
  ])('masks credentials in the URL %s', (input, expected) => {
    expect(redactString(input)).toBe(expected);
  });

  test('keeps harmless query values', () => {
    expect(redactString('/products?limit=20&skip=40')).toBe('/products?limit=20&skip=40');
  });

  test('survives cycles', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    a.list = [a];

    const result = redact(a) as { self: unknown; list: unknown[] };

    expect(result.self).toBe(CIRCULAR_MARK);
    expect(result.list).toEqual([CIRCULAR_MARK]);
  });

  test('does not flag a repeated, non-circular reference', () => {
    const shared = { id: 1 };

    expect(redact({ a: shared, b: shared })).toEqual({ a: { id: 1 }, b: { id: 1 } });
  });

  test('caps the depth', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 12; i += 1) {
      deep = { next: deep };
    }

    expect(JSON.stringify(redact(deep))).toContain(DEPTH_MARK);
  });
});

describe('logger redaction', () => {
  const spy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());

  afterEach(() => {
    jest.clearAllMocks();
    setLogTransport(undefined);
  });

  test('the transport and the dev console only receive redacted message and args', () => {
    const transport = jest.fn();
    setLogTransport(transport);
    const log = createLogger({ level: 'debug', isProduction: false });

    log.warn('login for john@example.com', { password: 'p', ok: 1 });

    const expected = {
      level: 'warn',
      message: 'login for j***@example.com',
      args: [{ password: REDACTED, ok: 1 }],
    };
    expect(transport).toHaveBeenCalledWith(expected);
    expect(spy).toHaveBeenCalledWith('login for j***@example.com', { password: REDACTED, ok: 1 });
  });

  test('production transport receives redacted args', () => {
    const transport = jest.fn();
    setLogTransport(transport);
    const log = createLogger({ level: 'debug', isProduction: true });

    log.error('failed', { accessToken: 'abc' });

    expect(transport).toHaveBeenCalledWith({
      level: 'error',
      message: 'failed',
      args: [{ accessToken: REDACTED }],
    });
  });
});
