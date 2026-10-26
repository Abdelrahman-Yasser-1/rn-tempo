import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react';

import { i18n } from '@services/i18n/i18n';
import { logger } from '@services/logger/logger';

import { MessageButton, MessageScreen } from '../screens/MessageScreen';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Catches render errors below it and offers a retry.
 * WS4 (task 4.x): replace with the shared ErrorBoundary component.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  /** Flips the boundary into its fallback state. */
  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  /** Logs the error with its component stack. */
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Unhandled render error', error, info.componentStack);
  }

  /** Renders the fallback until the user retries. */
  override render(): ReactElement {
    if (!this.state.hasError) {
      return <>{this.props.children}</>;
    }
    return (
      <MessageScreen
        message={i18n.t('startupError.message', { ns: 'app' })}
        testID="error-boundary-screen"
        title={i18n.t('startupError.title', { ns: 'app' })}
      >
        <MessageButton
          label={i18n.t('startupError.retryButton', { ns: 'app' })}
          onPress={() => {
            this.setState({ hasError: false });
          }}
          testID="error-boundary.retry-button"
        />
      </MessageScreen>
    );
  }
}
