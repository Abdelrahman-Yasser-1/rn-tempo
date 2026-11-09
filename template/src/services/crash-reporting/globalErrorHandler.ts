import { redact, redactString } from '@services/logger/redact';

/** A redacted copy of whatever was thrown. A non-Error value keeps only its redacted text. */
export function toRedactedError(thrown: unknown): Error {
  if (thrown instanceof Error) {
    return redact(thrown);
  }
  const text = typeof thrown === 'string' ? thrown : Object.prototype.toString.call(thrown);
  return new Error(redactString(`Non-error value thrown: ${text}`));
}

/**
 * Puts a handler in front of the current global JS error handler that passes on a redacted copy of
 * the error. Provider SDKs install their own global handler (Crashlytics records fatal JS errors
 * with their message and stack); with this in front they only ever see the redacted copy, exactly
 * like errors recorded through the logger. Install it after the provider started, so it wraps the
 * provider's handler. Returns a function that restores the previous handler.
 */
export function installRedactingErrorHandler(): () => void {
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((thrown: unknown, isFatal?: boolean) => {
    previous(toRedactedError(thrown), isFatal);
  });
  return () => {
    ErrorUtils.setGlobalHandler(previous);
  };
}
