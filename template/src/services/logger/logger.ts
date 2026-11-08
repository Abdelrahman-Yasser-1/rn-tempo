import { ENV } from '@config/env';

import { redact, redactString } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEntry = { level: LogLevel; message: string; args: readonly unknown[] };
/** Receives every entry that passes the level filter, already redacted. */
export type LogSink = (entry: LogEntry) => void;
export type LoggerOptions = {
  /** Minimum level to keep; `silent` drops everything. */
  level: LogLevel | 'silent';
  /** Production builds keep only warn and error, whatever `level` says. */
  isProduction: boolean;
};

/** Whether an error is an expected runtime failure (`isOperational: true`), like `ApiError` and `StorageError`. */
export function isOperationalError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && Reflect.get(error, 'isOperational') === true
  );
}

const RANK: Record<LogLevel | 'silent', number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const sinks = new Set<LogSink>();

/** Adds a sink (a remote reporter, a file, a test spy) and returns a function that removes it. */
export function addLogSink(sink: LogSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

let removeTransport: (() => void) | undefined;

/** Compat wrapper over `addLogSink`: one slot, replaced on each call; pass `undefined` to unplug. */
export function setLogTransport(next: LogSink | undefined): void {
  removeTransport?.();
  removeTransport = next ? addLogSink(next) : undefined;
}

function dispatch(entry: LogEntry): void {
  // Copy first: a sink may remove itself while we iterate.
  for (const sink of [...sinks]) {
    try {
      sink(entry);
    } catch {
      // A broken sink must not break the app or the other sinks. Not logged: that would recurse.
    }
  }
}

/** Builds a level-filtered logger; exported for tests, apps use the default `logger`. */
export function createLogger({ level, isProduction }: Readonly<LoggerOptions>) {
  const threshold = isProduction ? Math.max(RANK[level], RANK.warn) : RANK[level];

  const emit = (entryLevel: LogLevel, message: string, args: readonly unknown[]): void => {
    if (RANK[entryLevel] < threshold) {
      return;
    }
    // Redact once, before any sink: the sinks and the dev console only see safe copies.
    const safeMessage = redactString(message);
    const safeArgs = redact(args);
    dispatch({ level: entryLevel, message: safeMessage, args: safeArgs });
    if (!isProduction) {
      // The only place console is allowed: it is the dev sink behind the level filter.
      // eslint-disable-next-line no-console -- logger is the single console wrapper
      console[entryLevel](safeMessage, ...safeArgs);
    }
  };

  return {
    /** Verbose diagnostics, dev only. */
    debug: (message: string, ...args: unknown[]): void => {
      emit('debug', message, args);
    },
    /** Notable lifecycle events. */
    info: (message: string, ...args: unknown[]): void => {
      emit('info', message, args);
    },
    /** Recoverable problems; kept in production. */
    warn: (message: string, ...args: unknown[]): void => {
      emit('warn', message, args);
    },
    /** Failures; kept in production. */
    error: (message: string, ...args: unknown[]): void => {
      emit('error', message, args);
    },
  };
}

/** App logger, filtered by `ENV.LOG_LEVEL` (warn and error only in production builds). */
export const logger = createLogger({ level: ENV.LOG_LEVEL, isProduction: !__DEV__ });

/** Logs a caught error: `warn` when it is operational (expected at runtime), `error` when it is a bug. */
export function logError(message: string, error: unknown, ...args: unknown[]): void {
  const log = isOperationalError(error) ? logger.warn : logger.error;
  log(message, error, ...args);
}
