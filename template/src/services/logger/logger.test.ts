/* eslint-disable testing-library/no-debugging-utils -- `debug` here is the logger method, not RNTL debug() */
import { ApiError } from '@services/http/errors';

import {
  addLogSink,
  createLogger,
  isOperationalError,
  logError,
  logger,
  setLogTransport,
} from './logger';

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

  describe('sinks', () => {
    test('every sink receives the same entry', () => {
      const first = jest.fn();
      const second = jest.fn();
      const removeFirst = addLogSink(first);
      const removeSecond = addLogSink(second);
      const log = createLogger({ level: 'info', isProduction: true });

      log.warn('w', 1);

      expect(first).toHaveBeenCalledWith({ level: 'warn', message: 'w', args: [1] });
      expect(second).toHaveBeenCalledWith({ level: 'warn', message: 'w', args: [1] });
      removeFirst();
      removeSecond();
    });

    test('a throwing sink is swallowed and the other sinks still run', () => {
      const broken = jest.fn(() => {
        throw new Error('sink down');
      });
      const healthy = jest.fn();
      const removeBroken = addLogSink(broken);
      const removeHealthy = addLogSink(healthy);
      const log = createLogger({ level: 'info', isProduction: false });

      expect(() => {
        log.error('e');
      }).not.toThrow();

      expect(broken).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledTimes(1);
      expect(spies.error).toHaveBeenCalledWith('e');
      removeBroken();
      removeHealthy();
    });

    test('the returned function removes only its own sink', () => {
      const kept = jest.fn();
      const removed = jest.fn();
      const removeKept = addLogSink(kept);
      const removeRemoved = addLogSink(removed);
      const log = createLogger({ level: 'info', isProduction: true });

      removeRemoved();
      log.error('e');

      expect(removed).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalledTimes(1);
      removeKept();
    });

    test('a sink can remove itself while an entry is dispatched', () => {
      const other = jest.fn();
      const removeSelf = addLogSink(() => {
        removeSelf();
      });
      const removeOther = addLogSink(other);
      const log = createLogger({ level: 'info', isProduction: true });

      log.error('e');

      expect(other).toHaveBeenCalledTimes(1);
      removeOther();
    });

    test('setLogTransport replaces the previous transport without touching other sinks', () => {
      const sink = jest.fn();
      const firstTransport = jest.fn();
      const secondTransport = jest.fn();
      const removeSink = addLogSink(sink);
      const log = createLogger({ level: 'info', isProduction: true });

      setLogTransport(firstTransport);
      setLogTransport(secondTransport);
      log.error('e');

      expect(firstTransport).not.toHaveBeenCalled();
      expect(secondTransport).toHaveBeenCalledTimes(1);
      expect(sink).toHaveBeenCalledTimes(1);
      removeSink();
    });
  });

  describe('operational errors', () => {
    test('isOperationalError reads the flag and ignores everything else', () => {
      expect(isOperationalError(new ApiError({ code: 'NETWORK', message: 'x' }))).toBe(true);
      expect(isOperationalError(new ApiError({ code: 'UNKNOWN', message: 'x' }))).toBe(false);
      expect(isOperationalError(new Error('plain'))).toBe(false);
      expect(isOperationalError('text')).toBe(false);
      expect(isOperationalError(null)).toBe(false);
    });

    test('logError warns for an operational error and errors for a bug', () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
      const error = jest.spyOn(logger, 'error').mockImplementation(jest.fn());
      const offline = new ApiError({ code: 'NETWORK', message: 'offline' });
      const bug = new TypeError('undefined is not a function');

      logError('Request failed', offline, 'extra');
      logError('Render failed', bug);

      expect(warn).toHaveBeenCalledWith('Request failed', offline, 'extra');
      expect(error).toHaveBeenCalledWith('Render failed', bug);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
    });
  });
});
