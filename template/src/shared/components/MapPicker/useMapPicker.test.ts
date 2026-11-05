import { act, renderHook } from '@testing-library/react-native';
import { PermissionsAndroid, Platform } from 'react-native';

import { initI18nInstance } from '@services/i18n/i18n';
import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';

import { DEFAULT_CENTER, useMapPicker } from './useMapPicker';

jest.mock('@services/linking/linking', () => ({
  openSettings: jest.fn(() => Promise.resolve(true)),
}));

const animateToRegion = jest.fn();
const mapRef = { current: { animateToRegion } } as never;

const setup = (onChange = jest.fn()) =>
  renderHook(() => useMapPicker({ value: null, onChange, mapRef }));

const region = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
});

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

  it.each([
    ['the value', { latitude: 21.5, longitude: 39.2 }, { latitude: 30, longitude: 31 }, 21.5],
    ['the default center', null, { latitude: 30, longitude: 31 }, 30],
    ['Riyadh', undefined, undefined, 24.7136],
  ] as const)('opens on %s', async (_name, value, defaultCenter, latitude) => {
    const { result } = await renderHook(() =>
      useMapPicker({ value, defaultCenter, onChange: jest.fn(), mapRef }),
    );
    await act(() => {
      result.current.onOpen();
    });
    expect(result.current.initialRegion.latitude).toBe(latitude);
  });

  it('opens on Riyadh by default', () => {
    expect(DEFAULT_CENTER).toEqual({ latitude: 24.7136, longitude: 46.6753 });
  });

  it('formats the value and the draft as coordinates, and has no value text when empty', async () => {
    const { result } = await renderHook(() =>
      useMapPicker({
        value: { latitude: 21.5, longitude: 39.25 },
        onChange: jest.fn(),
        mapRef,
      }),
    );
    expect(result.current.valueText).toBe('21.50000, 39.25000');
    expect(result.current.draftText).toBe('21.50000, 39.25000');
    const { result: emptyResult } = await setup();
    expect(emptyResult.current.valueText).toBeUndefined();
  });

  it('resets the draft to the value when reopened after a cancel', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() =>
      useMapPicker({ value: { latitude: 10, longitude: 20 }, onChange, mapRef }),
    );
    await act(() => {
      result.current.onOpen();
    });
    await act(() => {
      result.current.onRegionChangeComplete(region(1, 2));
    });
    await act(() => {
      result.current.onClose();
    });
    await act(() => {
      result.current.onOpen();
    });
    expect(result.current.draftText).toBe('10.00000, 20.00000');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closing the sheet stops showing the user and clears the spinner', async () => {
    const { result } = await setup();
    await act(() => {
      result.current.onOpen();
    });
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(result.current.isShowingUser).toBe(true);
    expect(result.current.isLocating).toBe(true);
    await act(() => {
      result.current.onClose();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isShowingUser).toBe(false);
    expect(result.current.isLocating).toBe(false);
  });

  it('centres the map on the user location and moves the draft there', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    await act(() => {
      result.current.onUserLocationChange({
        nativeEvent: { coordinate: { latitude: 26.42, longitude: 50.09 } },
      });
    });
    expect(animateToRegion).toHaveBeenCalledWith({
      latitude: 26.42,
      longitude: 50.09,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    expect(result.current.draftText).toBe('26.42000, 50.09000');
    expect(result.current.isLocating).toBe(false);
  });

  it('ignores location updates it did not ask for', async () => {
    const { result } = await setup();
    await act(() => {
      result.current.onUserLocationChange({
        nativeEvent: { coordinate: { latitude: 1, longitude: 2 } },
      });
    });
    expect(animateToRegion).not.toHaveBeenCalled();
    expect(result.current.draftText).toBe('24.71360, 46.67530');
  });

  it('jumps again to the user location when the button is pressed a second time', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    await act(() => {
      result.current.onUserLocationChange({
        nativeEvent: { coordinate: { latitude: 26.42, longitude: 50.09 } },
      });
    });
    await act(() => {
      result.current.onRegionChangeComplete(region(1, 2));
    });
    animateToRegion.mockClear();
    // The map reports the user location only when it changes; a still user sends nothing more.
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 26.42, longitude: 50.09 }),
    );
    expect(result.current.isLocating).toBe(false);
    expect(result.current.draftText).toBe('26.42000, 50.09000');
  });

  it('on Android accepts coarse location when fine location is refused', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const show = jest.spyOn(toast, 'show').mockImplementation(jest.fn());
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(result.current.isShowingUser).toBe(true);
    expect(show).not.toHaveBeenCalled();
  });

  it('opens the OS settings from the denied toast', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const show = jest.spyOn(toast, 'show').mockImplementation(jest.fn());
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(result.current.isLocating).toBe(false);
    const [options] = show.mock.calls[0] ?? [];
    options?.actions?.[0]?.onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('never asks Android for permission on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const request = jest.spyOn(PermissionsAndroid, 'request');
    const { result } = await setup();
    await act(async () => {
      await result.current.onUseMyLocation();
    });
    expect(request).not.toHaveBeenCalled();
    expect(result.current.isShowingUser).toBe(true);
  });
});
