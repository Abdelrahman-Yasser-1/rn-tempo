import { useTranslation } from 'react-i18next';

import { openStore } from '@services/linking/linking';

import { MessageButton, MessageScreen } from '../MessageScreen';

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
