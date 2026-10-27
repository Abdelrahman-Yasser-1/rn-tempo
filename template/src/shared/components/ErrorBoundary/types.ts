import type { ReactNode } from 'react';

export type ErrorBoundaryProps = Readonly<{
  children?: ReactNode;
  /** Extra reporting hook, called after the error is logged. */
  onError?: (error: Error, componentStack: string) => void;
  testID?: string;
}>;

export type ErrorBoundaryState = Readonly<{
  error: Error | null;
}>;
