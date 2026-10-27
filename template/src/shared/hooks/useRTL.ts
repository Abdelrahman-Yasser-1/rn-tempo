import { I18nManager } from 'react-native';

/**
 * Whether the native layout direction is right-to-left. The direction only changes after an app
 * restart, so a plain read is correct; no subscription is needed.
 */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- public hook name from the UI kit contract
export function useRTL(): boolean {
  return I18nManager.isRTL;
}
