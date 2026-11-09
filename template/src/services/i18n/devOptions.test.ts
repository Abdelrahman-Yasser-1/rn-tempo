import { addLogSink } from '@services/logger/logger';
import type { LogEntry } from '@services/logger/logger';

import { getDevOptions, logMissingKey } from './devOptions';
import { i18n, initI18nInstance } from './i18n';

const translate = i18n.t as (key: string, options?: object) => string;

describe('getDevOptions', () => {
  test('AC-N-6: development saves missing keys through the logging handler', () => {
    const options = getDevOptions({ isDev: true, logLevel: 'info', isTest: false });

    expect(options).toEqual({
      saveMissing: true,
      missingKeyHandler: logMissingKey,
      debug: false,
    });
  });

  test('AC-N-6: release builds get no extra options', () => {
    expect(getDevOptions({ isDev: false, logLevel: 'debug', isTest: false })).toEqual({});
  });

  test('debug follows LOG_LEVEL=debug and stays off under Jest', () => {
    expect(getDevOptions({ isDev: true, logLevel: 'debug', isTest: false }).debug).toBe(true);
    expect(getDevOptions({ isDev: true, logLevel: 'warn', isTest: false }).debug).toBe(false);
    expect(getDevOptions({ isDev: true, logLevel: 'debug', isTest: true }).debug).toBe(false);
  });
});

describe('missing keys in development', () => {
  const entries: LogEntry[] = [];
  let removeSink: () => void;

  beforeAll(async () => {
    await initI18nInstance('en');
  });

  beforeEach(() => {
    entries.length = 0;
    removeSink = addLogSink((entry) => entries.push(entry));
    jest.spyOn(console, 'warn').mockImplementation(jest.fn());
  });

  afterEach(() => {
    removeSink();
    jest.restoreAllMocks();
  });

  test('AC-N-6: a missing key logs a warning with language, namespace and key', () => {
    translate('doesNotExist', { ns: 'common' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'warn', message: 'i18n: missing translation key' });
    expect(entries[0]?.args).toEqual([
      { language: 'en', namespace: 'common', key: 'doesNotExist' },
    ]);
  });

  test('AC-N-6: the warning never carries values or interpolation options', () => {
    translate('doesNotExist', { ns: 'common', name: 'Ada Lovelace', defaultValue: 'Hi Ada' });

    expect(JSON.stringify(entries)).not.toMatch(/Ada/);
  });

  test('AC-N-6: a key that exists logs nothing', () => {
    translate('title', { ns: 'home' });

    expect(entries).toEqual([]);
  });
});
