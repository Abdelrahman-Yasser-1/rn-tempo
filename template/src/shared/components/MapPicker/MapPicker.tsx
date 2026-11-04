import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, useWindowDimensions } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { useUnistyles } from 'react-native-unistyles';

import { isAndroid } from '@shared/utils/platform';

import { Box } from '../Box';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { PickerField } from '../PickerField';
import { PickerSheet } from '../PickerSheet';
import { Text } from '../Text';

import { PIN_SIZE, styles } from './styles';
import type { MapPickerProps } from './types';
import { useMapPicker } from './useMapPicker';

/** Share of the screen height the map takes inside the sheet. */
const MAP_HEIGHT_RATIO = 0.5;

/**
 * Location field: a trigger that opens a sheet with a map and a pin fixed at its centre. Pan the
 * map to put the pin on a place, optionally jump to the user's location (permission is requested
 * only then), and confirm. Apple Maps on iOS, Google Maps on Android (set `GOOGLE_MAPS_API_KEY`;
 * without it the map shows blank tiles). The value is `{ latitude, longitude, address? }`.
 */
export function MapPicker({
  value,
  onChange,
  defaultCenter,
  showMyLocation: hasMyLocation = true,
  placeholder,
  sheetTitle,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled,
  readOnly: isReadOnly,
  testID,
}: MapPickerProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const vm = useMapPicker({ value, onChange, defaultCenter, mapRef });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <>
      <PickerField
        label={label}
        required={isRequired}
        subLabel={subLabel}
        tooltip={tooltip}
        helperText={helperText}
        errorText={errorText}
        disabled={isDisabled}
        readOnly={isReadOnly}
        valueText={vm.valueText}
        placeholder={placeholder ?? t('mapPicker.placeholder')}
        icon="map-pin"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      {vm.isOpen && (
        <PickerSheet
          visible
          title={sheetTitle ?? label ?? t('mapPicker.title')}
          testID={suffix('sheet')}
          onConfirm={vm.onConfirm}
          onClose={vm.onClose}
        >
          <Box style={styles.body}>
            <View style={styles.mapFrame(Math.round(height * MAP_HEIGHT_RATIO))}>
              <MapView
                ref={mapRef}
                style={styles.map}
                // `PROVIDER_DEFAULT` is `undefined`: Apple Maps on iOS, Google Maps on Android.
                provider={isAndroid ? PROVIDER_GOOGLE : undefined}
                initialRegion={vm.initialRegion}
                userInterfaceStyle={theme.name}
                showsUserLocation={vm.isShowingUser}
                showsMyLocationButton={false}
                toolbarEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                accessibilityLabel={t('mapPicker.mapLabel')}
                testID={suffix('map')}
                onRegionChangeComplete={vm.onRegionChangeComplete}
                onUserLocationChange={vm.onUserLocationChange}
              />
              <View pointerEvents="none" style={styles.pinLayer}>
                <View style={styles.pin}>
                  <Icon name="map-pin" size={PIN_SIZE} color="error" />
                </View>
              </View>
              {hasMyLocation && (
                <View style={styles.myLocation}>
                  <IconButton
                    icon="current-location"
                    variant="secondary"
                    accessibilityLabel={t('mapPicker.useMyLocation')}
                    loading={vm.isLocating}
                    testID={suffix('my-location')}
                    onPress={() => {
                      void vm.onUseMyLocation();
                    }}
                  />
                </View>
              )}
            </View>
            <Text
              variant="caption"
              color="textSecondary"
              align="center"
              accessibilityLiveRegion="polite"
              testID={suffix('coordinates')}
            >
              {vm.draftText}
            </Text>
          </Box>
        </PickerSheet>
      )}
    </>
  );
}
