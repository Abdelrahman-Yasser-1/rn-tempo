import { useTranslation } from 'react-i18next';

import { MessageButton, MessageScreen } from '@app/screens/MessageScreen';
import { openStore } from '@services/linking/linking';

/** Blocking screen shown when the app is older than the remote `minSupportedVersion`. */
export function ForceUpdateScreen() {
  const { t } = useTranslation('app');

  return (
    <MessageScreen
      message={t('forceUpdate.message')}
      testID="force-update-screen"
      title={t('forceUpdate.title')}
    >
      <MessageButton
        label={t('forceUpdate.updateButton')}
        onPress={() => {
          void openStore();
        }}
        testID="force-update.update-button"
      />
    </MessageScreen>
  );
}
