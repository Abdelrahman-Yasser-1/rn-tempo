import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MapPicker } from './MapPicker';
import type { MapLocation } from './types';

const mockPlatform = { isAndroid: false };

jest.mock('@shared/utils/platform', () => ({
  get isAndroid() {
    return mockPlatform.isAndroid;
  },
}));
jest.mock('@services/linking/linking', () => ({
  openSettings: jest.fn(() => Promise.resolve(true)),
}));

type ModalInstance = { props: { onDismiss?: () => void } };
type MapProps = {
  onRegionChangeComplete: (region: object) => void;
  onUserLocationChange: (event: object) => void;
  showsUserLocation: boolean;
  provider?: string;
  initialRegion: { latitude: number; longitude: number };
};

const { mockAnimateToRegion } = jest.requireMock<{ mockAnimateToRegion: jest.Mock }>(
  'react-native-maps',
);
const mapProps = () => screen.getByLabelText('Map').props as MapProps;

function Harness({
  initial = null,
  isReadOnly,
  isDisabled,
}: Readonly<{ initial?: MapLocation | null; isReadOnly?: boolean; isDisabled?: boolean }>) {
  const [location, setLocation] = useState<MapLocation | null>(initial);

  return (
    <MapPicker
      label="Pickup"
      value={location}
      readOnly={isReadOnly}
      disabled={isDisabled}
      onChange={setLocation}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.isAndroid = false;
  jest.spyOn(toast, 'show').mockImplementation(jest.fn());
  jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(
    this: ModalInstance,
  ) {
    this.props.onDismiss?.();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MapPicker', () => {
  it('confirms the place under the pin', async () => {
    const { user } = await renderWithProviders(<Harness />);
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: undefined,
    });
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.getByText('24.71360, 46.67530')).toBeOnTheScreen();
    await act(() => {
      mapProps().onRegionChangeComplete({
        latitude: 21.5433,
        longitude: 39.1728,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    });
    expect(screen.getByText('21.54330, 39.17280')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: '21.54330, 39.17280',
    });
  });

  it('keeps the old value when the sheet is cancelled', async () => {
    const { user } = await renderWithProviders(
      <Harness initial={{ latitude: 24.7, longitude: 46.7 }} />,
    );
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await act(() => {
      mapProps().onRegionChangeComplete({ latitude: 1, longitude: 2 });
    });
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: '24.70000, 46.70000',
    });
  });

  it('asks for location access only when "Use my location" is pressed, then centres the map', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(mapProps().showsUserLocation).toBe(false);
    await user.press(screen.getByRole('button', { name: 'Use my location' }));
    expect(mapProps().showsUserLocation).toBe(true);
    await act(() => {
      mapProps().onUserLocationChange({
        nativeEvent: { coordinate: { latitude: 26.4207, longitude: 50.0888 } },
      });
    });
    expect(mockAnimateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: 26.4207, longitude: 50.0888 }),
    );
    expect(screen.getByText('26.42070, 50.08880')).toBeOnTheScreen();
  });

  it('hides the location button when asked to', async () => {
    await renderWithProviders(
      <MapPicker label="Pickup" showMyLocation={false} onChange={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeOnTheScreen();
  });

  it('mounts the map only while the sheet is open', async () => {
    const { user } = await renderWithProviders(<Harness />);
    expect(screen.queryByLabelText('Map')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.getByLabelText('Map')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Map')).not.toBeOnTheScreen();
  });

  it('opens the map on Riyadh when there is no value', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(mapProps().initialRegion).toMatchObject({ latitude: 24.7136, longitude: 46.6753 });
  });

  it('opens the map on the current value', async () => {
    const { user } = await renderWithProviders(
      <Harness initial={{ latitude: 21.5, longitude: 39.2 }} />,
    );
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(mapProps().initialRegion).toMatchObject({ latitude: 21.5, longitude: 39.2 });
  });

  it('commits {latitude, longitude} to onChange on Confirm', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<MapPicker label="Pickup" onChange={onChange} />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await act(() => {
      mapProps().onRegionChangeComplete({
        latitude: 21.5433,
        longitude: 39.1728,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    });
    expect(onChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ latitude: 21.5433, longitude: 39.1728 });
  });

  it('does not call onChange when the sheet is cancelled', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(<MapPicker label="Pickup" onChange={onChange} />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await act(() => {
      mapProps().onRegionChangeComplete({ latitude: 1, longitude: 2 });
    });
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses the default provider on iOS', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(mapProps().provider).toBeUndefined();
  });

  it('uses Google Maps on Android', async () => {
    mockPlatform.isAndroid = true;
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(mapProps().provider).toBe('google');
  });

  it('shows the denied toast with an Open settings action when Android refuses location', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await user.press(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => {
      expect(toast.show).toHaveBeenCalledTimes(1);
    });
    const [options] = jest.mocked(toast.show).mock.calls[0] ?? [];
    expect(options?.title).toBe('Allow location access in Settings to jump to where you are.');
    expect(options?.actions?.[0]?.label).toBe('Open settings');
    options?.actions?.[0]?.onPress();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(mapProps().showsUserLocation).toBe(false);
  });

  it('shows the denied toast when the map reports a location error', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    await user.press(screen.getByRole('button', { name: 'Use my location' }));
    await act(() => {
      mapProps().onUserLocationChange({ nativeEvent: { error: { message: 'denied' } } });
    });
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(mapProps().showsUserLocation).toBe(false);
  });

  it('is read-only: it shows the value but does not open', async () => {
    const { user } = await renderWithProviders(
      <Harness initial={{ latitude: 24.7, longitude: 46.7 }} isReadOnly />,
    );
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.queryByLabelText('Map')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: '24.70000, 46.70000',
    });
  });

  it('is disabled: it does not open', async () => {
    const { user } = await renderWithProviders(<Harness isDisabled />);
    expect(screen.getByRole('button', { name: 'Pickup' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.queryByLabelText('Map')).not.toBeOnTheScreen();
  });

  it('titles the sheet with the sheet title, the label, or a default', async () => {
    const { user, rerender } = await renderWithProviders(
      <MapPicker label="Pickup" sheetTitle="Where to?" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Pickup' }));
    expect(screen.getByRole('header', { name: 'Where to?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    await rerender(<MapPicker onChange={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Choose a location' }));
    expect(screen.getByRole('header', { name: 'Choose a location' })).toBeOnTheScreen();
  });
});
