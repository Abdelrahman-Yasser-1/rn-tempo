import { useTranslation } from 'react-i18next';

import { MessageButton, MessageScreen } from '../MessageScreen';

type Props = {
  onRetry: () => void;
};

/** Shown when startup itself failed (storage, i18n or auth could not initialise). */
export function StartupErrorScreen({ onRetry }: Readonly<Props>) {
  const { t } = useTranslation('app');

  return (
    <MessageScreen
      message={t('startupError.message')}
      testID="startup-error-screen"
      title={t('startupError.title')}
    >
      <MessageButton
        label={t('startupError.retryButton')}
        onPress={onRetry}
        testID="startup-error.retry-button"
      />
    </MessageScreen>
  );
}
