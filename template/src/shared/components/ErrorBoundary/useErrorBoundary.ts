import { useTranslation } from 'react-i18next';
import RNRestart from 'react-native-restart';

import type { ErrorBoundaryVariant } from './types';

type Options = Readonly<{
  variant: ErrorBoundaryVariant;
  onReset: () => void;
}>;

/** Labels and the primary action of the fallback: restart for the app, try again for a screen. */
export function useErrorBoundary({ variant, onReset }: Options) {
  const { t } = useTranslation();
  const isScreen = variant === 'screen';

  return {
    title: isScreen ? t('errorBoundary.screenTitle') : undefined,
    retryLabel: isScreen ? t('errorBoundary.tryAgain') : t('errorBoundary.restart'),
    goBackLabel: t('errorBoundary.goBack'),
    onRetry: isScreen
      ? onReset
      : () => {
          RNRestart.restart();
        },
  };
}
