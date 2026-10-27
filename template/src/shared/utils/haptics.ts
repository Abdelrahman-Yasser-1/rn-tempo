import { Vibration } from 'react-native';

import { isIOS } from './platform';

const LIGHT_MS = 10;
const MEDIUM_MS = 20;
const ERROR_PATTERN_MS = [0, 40, 60, 40];

/**
 * Minimal haptics on core `Vibration` (no dependency). iOS ignores durations and plays a single
 * system vibration, so keep calls rare. For richer feedback install `react-native-haptic-feedback`
 * and swap these bodies for `trigger('impactLight' | 'impactMedium' | 'notificationError')`.
 */
export const haptics = {
  /** Subtle tap for selections and toggles. */
  light: (): void => {
    Vibration.vibrate(isIOS ? undefined : LIGHT_MS);
  },
  /** Firmer tap for confirmations. */
  medium: (): void => {
    Vibration.vibrate(isIOS ? undefined : MEDIUM_MS);
  },
  /** Double pulse for a failed action. */
  error: (): void => {
    Vibration.vibrate(isIOS ? undefined : ERROR_PATTERN_MS);
  },
};
