import { useTranslation } from 'react-i18next';
import { BackHandler, Platform } from 'react-native';

import type { SecurityReason } from '../../bootstrap/securityStore';
import { MessageButton, MessageScreen } from '../MessageScreen';

type Props = {
  reasons?: readonly SecurityReason[];
};

/**
 * Blocking, non-recoverable screen. The only action is Close, which exits the app on Android; iOS
 * has no sanctioned way to terminate an app, so it shows the message without a button.
 */
export function SecurityErrorScreen({ reasons = [] }: Readonly<Props>) {
  const { t } = useTranslation('app');
  const reasonMessages: Record<SecurityReason, string> = {
    ssl: t('security.reason.ssl'),
    jailbroken: t('security.reason.jailbroken'),
    debugMode: t('security.reason.debugMode'),
    hookDetected: t('security.reason.hookDetected'),
  };
  const details = reasons.map((reason) => reasonMessages[reason]).join('\n');
  const message = details === '' ? t('security.message') : `${t('security.message')}\n\n${details}`;

  return (
    <MessageScreen message={message} testID="security-error-screen" title={t('security.title')}>
      {Platform.OS === 'android' && (
        <MessageButton
          label={t('security.closeButton')}
          onPress={() => {
            BackHandler.exitApp();
          }}
          testID="security-error.close-button"
        />
      )}
    </MessageScreen>
  );
}
