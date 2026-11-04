import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { act, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MapPicker } from './MapPicker';
import type { MapLocation } from './types';

type ModalInstance = { props: { onDismiss?: () => void } };
type MapProps = {
  onRegionChangeComplete: (region: object) => void;
  onUserLocationChange: (event: object) => void;
  showsUserLocation: boolean;
};

const { mockAnimateToRegion } = jest.requireMock<{ mockAnimateToRegion: jest.Mock }>(
  'react-native-maps',
);
const mapProps = () => screen.getByLabelText('Map').props as MapProps;

function Harness({ initial = null }: Readonly<{ initial?: MapLocation | null }>) {
  const [location, setLocation] = useState<MapLocation | null>(initial);

  return <MapPicker label="Pickup" value={location} onChange={setLocation} />;
}

beforeEach(() => {
  jest.clearAllMocks();
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
});
