import { ENV } from '@config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogEntry = { level: LogLevel; message: string; args: readonly unknown[] };
export type LogTransport = (entry: LogEntry) => void;
export type LoggerOptions = {
  /** Minimum level to keep; `silent` drops everything. */
  level: LogLevel | 'silent';
  /** Production builds keep only warn and error, whatever `level` says. */
  isProduction: boolean;
};

const RANK: Record<LogLevel | 'silent', number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

let transport: LogTransport | undefined;

/** Plugs in a remote sink (the Sentry recipe uses this); pass `undefined` to unplug. */
export function setLogTransport(next: LogTransport | undefined): void {
  transport = next;
}

/** Builds a level-filtered logger; exported for tests, apps use the default `logger`. */
export function createLogger({ level, isProduction }: Readonly<LoggerOptions>) {
  const threshold = isProduction ? Math.max(RANK[level], RANK.warn) : RANK[level];

  const emit = (entryLevel: LogLevel, message: string, args: readonly unknown[]): void => {
    if (RANK[entryLevel] < threshold) {
      return;
    }
    transport?.({ level: entryLevel, message, args });
    if (!isProduction) {
      // The only place console is allowed: it is the dev sink behind the level filter.
      // eslint-disable-next-line no-console -- logger is the single console wrapper
      console[entryLevel](message, ...args);
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
