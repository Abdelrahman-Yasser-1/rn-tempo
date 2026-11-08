import { openSettings } from '@services/linking/linking';
import { usePushPermission } from '@services/push/permission';

/**
 * Logic of the Notifications row: it is on when the system permission is granted. Turning it on asks
 * for the permission (at this meaningful moment, not at startup); when the system will not ask any
 * more, or to turn it off, it opens the system settings, the only place that can change it.
 */
export function useNotificationsRow() {
  const { status, request } = usePushPermission();

  const toggle = async (isOn: boolean) => {
    if (isOn && status !== 'blocked') {
      if ((await request()) === 'blocked') {
        await openSettings();
      }
      return;
    }
    await openSettings();
  };

  const onToggle = (isOn: boolean) => {
    void toggle(isOn);
  };

  return { status, isOn: status === 'granted', onToggle };
}
