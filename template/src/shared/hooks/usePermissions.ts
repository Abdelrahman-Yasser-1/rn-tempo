import { useCallback, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import type { Permission } from 'react-native';

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'blocked' | 'unavailable';

/**
 * Thin Android runtime-permission helper over `PermissionsAndroid`.
 *
 * iOS has no JS permission API in core React Native: it reports `unavailable`. To request iOS
 * permissions (camera, location, notifications) install `react-native-permissions`, add the
 * `Info.plist` usage strings and the Podfile `setup_permissions` entries, then call
 * `request(PERMISSIONS.IOS.X)` from this hook's `request` callback instead.
 */
export function usePermissions(permission: Permission) {
  const [status, setStatus] = useState<PermissionStatus>(
    Platform.OS === 'android' ? 'unknown' : 'unavailable',
  );

  const check = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return 'unavailable' as const;
    }
    const isGranted = await PermissionsAndroid.check(permission);
    const next = isGranted ? 'granted' : 'denied';
    setStatus(next);
    return next;
  }, [permission]);

  const request = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return 'unavailable' as const;
    }
    const result = await PermissionsAndroid.request(permission);
    let next: PermissionStatus = 'denied';
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      next = 'granted';
    } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      next = 'blocked';
    }
    setStatus(next);
    return next;
  }, [permission]);

  return { status, check, request };
}
