import { CommonActions, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAuthStatus } from '@features/auth';

import { MessageButton, MessageScreen } from '../MessageScreen';

/** Fallback for unknown deep links (`*`): one button back to the right root for the session. */
export function NotFoundScreen() {
  const { t } = useTranslation('app');
  const navigation = useNavigation();
  const status = useAuthStatus();

  const goHome = (): void => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: status === 'signedIn' ? 'Main' : 'Auth' }],
      }),
    );
  };

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
