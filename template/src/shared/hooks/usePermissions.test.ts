import { act, renderHook } from '@testing-library/react-native';
import { Platform, PermissionsAndroid } from 'react-native';

import { usePermissions } from './usePermissions';

const CAMERA = 'android.permission.CAMERA' as const;

describe('usePermissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('on iOS', () => {
    it('reports unavailable and never prompts', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const request = jest.spyOn(PermissionsAndroid, 'request');
      const { result } = await renderHook(() => usePermissions(CAMERA));
      expect(result.current.status).toBe('unavailable');
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.request();
      });
      expect(outcome).toBe('unavailable');
      expect(request).not.toHaveBeenCalled();
    });
  });

  describe('on Android', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
    });

    it('starts unknown until checked', async () => {
      const { result } = await renderHook(() => usePermissions(CAMERA));
      expect(result.current.status).toBe('unknown');
    });

    it('records a granted check', async () => {
      jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
      const { result } = await renderHook(() => usePermissions(CAMERA));
      await act(async () => {
        await result.current.check();
      });
      expect(result.current.status).toBe('granted');
    });

    it('records a granted request', async () => {
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
      const { result } = await renderHook(() => usePermissions(CAMERA));
      let outcome: string | undefined;
      await act(async () => {
        outcome = await result.current.request();
      });
      expect(outcome).toBe('granted');
      expect(result.current.status).toBe('granted');
    });

    it('marks a permanent refusal as blocked', async () => {
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
      const { result } = await renderHook(() => usePermissions(CAMERA));
      await act(async () => {
        await result.current.request();
      });
      expect(result.current.status).toBe('blocked');
    });

    it('marks an ordinary refusal as denied', async () => {
      jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
      const { result } = await renderHook(() => usePermissions(CAMERA));
      await act(async () => {
        await result.current.request();
      });
      expect(result.current.status).toBe('denied');
    });
  });
});
