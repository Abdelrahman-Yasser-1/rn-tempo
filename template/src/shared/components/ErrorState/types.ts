export type ErrorStateProps = Readonly<{
  /**
   * Anything thrown by the data layer. An `ApiError` picks a matching translated message
   * (see `getErrorMessageKey`); other values show the generic one.
   */
  error?: unknown;
  /** Overrides the default translated title. */
  title?: string;
  /** Overrides the message derived from `error`. */
  message?: string;
  /** Shows a button that calls this; the label defaults to a translated "Retry". */
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
}>;
