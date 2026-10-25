/* eslint-disable testing-library/no-debugging-utils -- `debug` here is the logger method, not RNTL debug() */
import { createLogger, setLogTransport } from './logger';

describe('logger', () => {
  const spies = {
    debug: jest.spyOn(console, 'debug').mockImplementation(jest.fn()),
    info: jest.spyOn(console, 'info').mockImplementation(jest.fn()),
    warn: jest.spyOn(console, 'warn').mockImplementation(jest.fn()),
    error: jest.spyOn(console, 'error').mockImplementation(jest.fn()),
  };

  afterEach(() => {
    jest.clearAllMocks();
    setLogTransport(undefined);
  });

  test('AC-3: dev with level info drops debug and keeps the rest', () => {
    const log = createLogger({ level: 'info', isProduction: false });

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e', { code: 1 });

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledWith('i');
    expect(spies.warn).toHaveBeenCalledWith('w');
    expect(spies.error).toHaveBeenCalledWith('e', { code: 1 });
  });

  test('AC-3: level silent drops everything', () => {
    const log = createLogger({ level: 'silent', isProduction: false });

    log.error('e');

    expect(spies.error).not.toHaveBeenCalled();
  });

  test('AC-3: production keeps only warn and error, even at level debug, and never uses console', () => {
    const transport = jest.fn();
    setLogTransport(transport);
    const log = createLogger({ level: 'debug', isProduction: true });

    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e', 42);

    expect(transport.mock.calls).toEqual([
      [{ level: 'warn', message: 'w', args: [] }],
      [{ level: 'error', message: 'e', args: [42] }],
    ]);
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
  });

  test('AC-3: production honors a stricter level than warn', () => {
    const transport = jest.fn();
    setLogTransport(transport);
    const log = createLogger({ level: 'error', isProduction: true });

    log.warn('w');
    log.error('e');

    expect(transport).toHaveBeenCalledTimes(1);
  });

  test('AC-3: transport also receives dev entries that pass the filter', () => {
    const transport = jest.fn();
    setLogTransport(transport);
    const log = createLogger({ level: 'warn', isProduction: false });

    log.info('i');
    log.warn('w');

    expect(transport).toHaveBeenCalledTimes(1);
  });
});
