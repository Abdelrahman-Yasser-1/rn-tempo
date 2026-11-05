import type { ReactNode } from 'react';

export type ErrorBoundaryVariant = 'app' | 'screen';

export type ErrorBoundaryProps = Readonly<{
  children?: ReactNode;
  /**
   * `app` (default) offers "Restart app". `screen` isolates one screen and offers "Try again",
   * which re-renders the children, plus "Go back" when `onGoBack` is set.
   */
  variant?: ErrorBoundaryVariant;
  /** Names the screen in the log line (route name) so a failure is attributed to its feature. */
  screenName?: string;
  /** Resets the boundary when any entry changes (compared with `Object.is`). */
  resetKeys?: readonly unknown[];
  /** Called after the boundary resets, from "Try again" or from a `resetKeys` change. */
  onReset?: () => void;
  /** Screen variant only: shows a "Go back" action when set. */
  onGoBack?: () => void;
  /** Extra reporting hook, called after the error is logged. */
  onError?: (error: Error, componentStack: string) => void;
  testID?: string;
}>;

export type ErrorBoundaryState = Readonly<{
  error: Error | null;
}>;

export type ErrorFallbackProps = Readonly<{
  error: Error;
  variant: ErrorBoundaryVariant;
  onReset: () => void;
  onGoBack?: () => void;
  testID?: string;
}>;
