import { useTranslation } from 'react-i18next';

import { Icon, ListItem } from '@shared/components';

import { useNotificationsRow } from './useNotificationsRow';

const SUBTITLE_KEYS = {
  granted: 'notifications.on',
  denied: 'notifications.off',
  undetermined: 'notifications.off',
  blocked: 'notifications.blocked',
} as const;

/** Settings row with a switch for push notifications. */
export function NotificationsRow() {
  const { t } = useTranslation('settings');
  const vm = useNotificationsRow();

  return (
    <ListItem
      title={t('notifications.title')}
      subtitle={t(SUBTITLE_KEYS[vm.status])}
      left={<Icon name="bell" />}
      trailing={{ type: 'switch', value: vm.isOn, onValueChange: vm.onToggle }}
      accessibilityLabel={t('notifications.title')}
      showDivider
      testID="settings.notifications"
    />
  );
}
