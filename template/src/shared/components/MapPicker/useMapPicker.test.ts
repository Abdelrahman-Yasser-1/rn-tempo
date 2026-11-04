import { act, renderHook } from '@testing-library/react-native';
import { PermissionsAndroid, Platform } from 'react-native';

import { initI18nInstance } from '@services/i18n/i18n';
import { toast } from '@services/toast/toast';

import { DEFAULT_CENTER, useMapPicker } from './useMapPicker';

const mapRef = { current: { animateToRegion: jest.fn() } } as never;

const setup = (onChange = jest.fn()) =>
  renderHook(() => useMapPicker({ value: null, onChange, mapRef }));

beforeAll(async () => {
  await initI18nInstance('en');
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useMapPicker', () => {
  it('opens on the default center and confirms the drafted place, rounded', async () => {
    const onChange = jest.fn();
    const { result } = await setup(onChange);
    await act(() => {
      result.current.onOpen();
    });
    expect(result.current.initialRegion).toMatchObject(DEFAULT_CENTER);
    await act(() => {
      result.current.onRegionChangeComplete({
        latitude: 21.123456789,
        longitude: 39.987654321,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    });
    result.current.onConfirm();
    expect(onChange).toHaveBeenCalledWith({ latitude: 21.123457, longitude: 39.987654 });
  });

  it('on Android requests location access when asked, and explains a refusal', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const show = jest.spyOn(toast, 'show').mockImplementation(jest.fn());
    const { result } = await setup();
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    expect(result.current.isShowingUser).toBe(false);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        actions: [expect.objectContaining({ label: 'Open settings' })],
      }),
    );
  });

  it('on Android shows the user location once permission is granted', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('granted');
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(result.current.isShowingUser).toBe(true);
    expect(result.current.isLocating).toBe(true);
  });

  it('explains a location error reported by the map', async () => {
    const show = jest.spyOn(toast, 'show').mockImplementation(jest.fn());
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    await act(() => {
      result.current.onUserLocationChange({ nativeEvent: { error: { message: 'denied' } } });
    });
    expect(result.current.isShowingUser).toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
  });
});
