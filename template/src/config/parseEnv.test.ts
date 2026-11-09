import { EnvError, parseEnv } from './parseEnv';

const VALID = {
  APP_ENV: 'dev',
  API_BASE_URL: 'https://api.example.com',
  DEEP_LINK_SCHEME: 'tempo',
};

describe('parseEnv', () => {
  test('parses a valid config and coerces values', () => {
    const env = parseEnv({
      ...VALID,
      API_TIMEOUT_MS: '5000',
      API_MOCKING: 'true',
      LOG_LEVEL: 'debug',
    });

    expect(env.APP_ENV).toBe('dev');
    expect(env.API_TIMEOUT_MS).toBe(5000);
    expect(env.API_MOCKING).toBe(true);
    expect(env.LOG_LEVEL).toBe('debug');
  });

  test('applies defaults for optional values', () => {
    expect(parseEnv(VALID)).toMatchObject({
      API_TIMEOUT_MS: 15000,
      API_MOCKING: false,
      SSL_PINNING_ENABLED: false,
      SSL_PINS: [],
      DEVICE_INTEGRITY_ENABLED: false,
      STORYBOOK_ENABLED: false,
      FIREBASE_ENABLED: false,
      PUSH_ENABLED: false,
      CRASH_REPORTING_ENABLED: false,
      CRASH_REPORTER: 'none',
      DEEP_LINK_HOST: '',
      APP_CONFIG_PATH: '/app-config',
      LOG_LEVEL: 'info',
    });
  });

  test('throws an EnvError naming the bad URL', () => {
    let caught: unknown;
    try {
      parseEnv({ ...VALID, API_BASE_URL: 'not a url' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvError);
    expect(caught).toMatchObject({ name: 'EnvError' });
    expect((caught as EnvError).issues.map((issue) => issue.path)).toEqual([['API_BASE_URL']]);
    expect((caught as EnvError).message).toContain('API_BASE_URL');
  });

  test('requires at least 2 pins when pinning is enabled', () => {
    expect(() => parseEnv({ ...VALID, SSL_PINNING_ENABLED: 'true', SSL_PINS: 'a' })).toThrow(
      /At least 2 pins required/,
    );
    expect(parseEnv({ ...VALID, SSL_PINNING_ENABLED: 'true', SSL_PINS: 'a, b' }).SSL_PINS).toEqual([
      'a',
      'b',
    ]);
  });

  test('rejects missing required keys and unknown environments', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({ ...VALID, APP_ENV: 'qa' })).toThrow(/APP_ENV/);
  });
});
