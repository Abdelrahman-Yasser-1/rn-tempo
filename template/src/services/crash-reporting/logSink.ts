import { isOperationalError, type LogEntry, type LogSink } from '@services/logger/logger';

import type { CrashAttributes } from './types';

/** What the sink feeds; the facade passes its own gated functions. */
export type CrashSinkTarget = {
  log: (message: string) => void;
  recordError: (error: Error, context?: CrashAttributes) => void;
};

/**
 * Turns log entries into crash reporting calls. Entries reach a sink already redacted, and only the
 * message and the error are used (never other arguments, which may carry data):
 * - `warn` becomes a breadcrumb.
 * - `error` with a non-operational error (a bug) is recorded as a non-fatal.
 * - `error` without one (or with an expected failure) becomes a breadcrumb.
 */
export function createCrashLogSink(target: CrashSinkTarget): LogSink {
  return (entry: LogEntry): void => {
    if (entry.level === 'warn') {
      target.log(`warn: ${entry.message}`);
      return;
    }
    if (entry.level !== 'error') {
      return;
    }
    const error = entry.args.find((arg): arg is Error => arg instanceof Error);
    if (error !== undefined && !isOperationalError(error)) {
      target.recordError(error, { log_message: entry.message });
      return;
    }
    target.log(`error: ${entry.message}`);
  };
}
