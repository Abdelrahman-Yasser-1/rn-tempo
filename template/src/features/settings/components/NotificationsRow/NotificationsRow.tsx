import { keyFromSelector } from 'i18next';
import { useTranslation } from 'react-i18next';

import { isPushEnabled } from '@services/push/firebase';
import { Icon, ListItem } from '@shared/components';

import { useNotificationsRow } from './useNotificationsRow';

const SUBTITLE_KEYS = {
  granted: keyFromSelector(($) => $.notifications.on, { ns: 'settings' }),
  denied: keyFromSelector(($) => $.notifications.off, { ns: 'settings' }),
  undetermined: keyFromSelector(($) => $.notifications.off, { ns: 'settings' }),
  blocked: keyFromSelector(($) => $.notifications.blocked, { ns: 'settings' }),
} as const;

/** Settings row with a switch for push notifications. Hidden when push is off for this environment. */
export function NotificationsRow() {
  const { t } = useTranslation('settings');
  const vm = useNotificationsRow();

  if (!isPushEnabled()) {
    return null;
  }

  return (
    <ListItem
      title={t(($) => $.notifications.title)}
      subtitle={t(SUBTITLE_KEYS[vm.status])}
      left={<Icon name="bell" />}
      trailing={{ type: 'switch', value: vm.isOn, onValueChange: vm.onToggle }}
      accessibilityLabel={t(($) => $.notifications.title)}
      showDivider
      testID="settings.notifications"
    />
  );
}
