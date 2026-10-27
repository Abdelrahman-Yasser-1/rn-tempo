import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import RNRestart from 'react-native-restart';

import { logger } from '@services/logger/logger';

import { ErrorState } from '../ErrorState';

import { styles } from './styles';
import type { ErrorBoundaryProps, ErrorBoundaryState } from './types';

function Fallback({ error, testID }: Readonly<{ error: Error; testID?: string }>) {
  const { t } = useTranslation();

  return (
    <View testID={testID} style={styles.root}>
      <ErrorState
        testID={testID ? `${testID}.state` : undefined}
        error={error}
        retryLabel={t('errorBoundary.restart')}
        onRetry={() => {
          RNRestart.restart();
        }}
      />
    </View>
  );
}

/**
 * Catches render errors below it, logs them and shows an `ErrorState` with a "Restart app" action.
 * Place it inside the i18n provider so the fallback is translated.
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
    logger.error('Unhandled render error', error, stack);
    this.props.onError?.(error, stack);
  }

  /** Renders the children, or the fallback after an error. */
  override render(): ReactNode {
    const { error } = this.state;
    return error === null ? (
      <>{this.props.children}</>
    ) : (
      <Fallback error={error} testID={this.props.testID} />
    );
  }
}
