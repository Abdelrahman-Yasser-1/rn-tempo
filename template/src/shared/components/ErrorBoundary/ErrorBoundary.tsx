import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { View } from 'react-native';

import { logError } from '@services/logger/logger';
import { Button } from '@shared/components/Button';
import { ErrorState } from '@shared/components/ErrorState';

import { styles } from './styles';
import type { ErrorBoundaryProps, ErrorBoundaryState, ErrorFallbackProps } from './types';
import { useErrorBoundary } from './useErrorBoundary';

function Fallback({ error, variant, onReset, onGoBack, testID }: ErrorFallbackProps) {
  const { title, retryLabel, goBackLabel, onRetry } = useErrorBoundary({ variant, onReset });

  return (
    <View testID={testID} style={styles.root}>
      <ErrorState
        testID={testID ? `${testID}.state` : undefined}
        error={error}
        title={title}
        retryLabel={retryLabel}
        onRetry={onRetry}
      />
      {variant === 'screen' && onGoBack !== undefined && (
        <Button
          testID={testID ? `${testID}.goBack` : undefined}
          variant="ghost"
          title={goBackLabel}
          icon="arrow-left"
          onPress={onGoBack}
        />
      )}
    </View>
  );
}

const keysChanged = (previous: readonly unknown[] = [], next: readonly unknown[] = []): boolean =>
  previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));

/**
 * Catches render errors below it, logs them and shows an `ErrorState`. The `app` variant offers
 * "Restart app"; the `screen` variant isolates one screen with "Try again" (and "Go back"), and
 * resets when `resetKeys` change. Place it inside the i18n provider so the fallback is translated.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  /** Stores the error so the next render shows the fallback. */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  /** Logs the error with its component stack and forwards it to `onError`. */
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stack = info.componentStack ?? '';
    const { screenName } = this.props;
    logError(
      screenName === undefined
        ? 'Unhandled render error'
        : `Unhandled render error in ${screenName}`,
      error,
      stack,
    );
    this.props.onError?.(error, stack);
  }

  /** Resets after an error when `resetKeys` changed, e.g. the user navigated to another route. */
  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error !== null && keysChanged(previous.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  /** Renders the children, or the fallback after an error. */
  override render(): ReactNode {
    const { error } = this.state;
    return error === null ? (
      <>{this.props.children}</>
    ) : (
      <Fallback
        error={error}
        variant={this.props.variant ?? 'app'}
        onReset={this.reset}
        onGoBack={this.props.onGoBack}
        testID={this.props.testID}
      />
    );
  }
}
