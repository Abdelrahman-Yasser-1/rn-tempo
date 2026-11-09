import { useTranslation } from 'react-i18next';

import { MessageButton, MessageScreen } from '@app/screens/MessageScreen';

import { useNotFoundScreen } from './useNotFoundScreen';

/** Fallback for unknown deep links (`*`): one button back to the right root for the session. */
export function NotFoundScreen() {
  const { t } = useTranslation('app');
  const { goHome } = useNotFoundScreen();

  return (
    <MessageScreen
      message={t('notFound.message')}
      testID="not-found-screen"
      title={t('notFound.title')}
    >
      <MessageButton
        label={t('notFound.homeButton')}
        onPress={goHome}
        testID="not-found.home-button"
      />
    </MessageScreen>
  );
}
