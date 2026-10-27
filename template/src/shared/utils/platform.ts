import { Platform } from 'react-native';

export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

/** Picks the value for the current platform: `select({ ios: 1, android: 2, default: 0 })`. */
export function select<T>(spec: Readonly<{ ios?: T; android?: T; default: T }>): T {
  return (isIOS ? spec.ios : spec.android) ?? spec.default;
}
