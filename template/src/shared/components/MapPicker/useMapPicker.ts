import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionsAndroid, Platform } from 'react-native';
import type { Region } from 'react-native-maps';

import { openSettings } from '@services/linking/linking';
import { toast } from '@services/toast/toast';
import { usePermissions } from '@shared/hooks';
import { formatNumber } from '@shared/utils/format';

import type { MapCenter, MapLocation, UseMapPickerOptions } from './types';

/** Riyadh; where the map opens when the field has no value and no `defaultCenter`. */
export const DEFAULT_CENTER: MapCenter = { latitude: 24.7136, longitude: 46.6753 };

/** Zoom of the map when it opens, and after jumping to the user's location. */
const OPEN_DELTA = 0.02;
const LOCATION_DELTA = 0.01;
const COORDINATE_DIGITS = 5;
const STORED_DIGITS = 1e6;

const round = (value: number) => Math.round(value * STORED_DIGITS) / STORED_DIGITS;

/**
 * Logic of the map picker: the sheet's open state, the draft under the centre pin, confirming it,
 * and "use my location". Location access is requested only when that button is pressed: Android
 * asks here, iOS asks when the map starts showing the user's location. A refusal explains itself
 * with an "Open settings" action.
 */
export function useMapPicker({ value, onChange, defaultCenter, mapRef }: UseMapPickerOptions) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [start, setStart] = useState<MapCenter>(value ?? defaultCenter ?? DEFAULT_CENTER);
  const [draft, setDraft] = useState<MapCenter>(start);
  const [isShowingUser, setIsShowingUser] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  // The newest position the map reported while it shows the user; it reports only on changes.
  const userCenterRef = useRef<MapCenter | undefined>(undefined);
  const fine = usePermissions(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  const coarse = usePermissions(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);

  const formatCoordinates = (center: MapCenter) => {
    const options = {
      minimumFractionDigits: COORDINATE_DIGITS,
      maximumFractionDigits: COORDINATE_DIGITS,
    };
    return t('mapPicker.coordinates', {
      latitude: formatNumber(center.latitude, i18n.language, options),
      longitude: formatNumber(center.longitude, i18n.language, options),
    });
  };

  const showDenied = () => {
    toast.show({
      type: 'error',
      title: t('mapPicker.permissionDenied'),
      actions: [
        {
          label: t('mapPicker.openSettings'),
          onPress: () => {
            void openSettings();
          },
        },
      ],
    });
  };

  const hasLocationAccess = async () =>
    Platform.OS !== 'android'
      ? true
      : (await fine.request()) === 'granted' || (await coarse.check()) === 'granted';

  const jumpTo = (center: MapCenter) => {
    setDraft(center);
    mapRef.current?.animateToRegion({
      ...center,
      latitudeDelta: LOCATION_DELTA,
      longitudeDelta: LOCATION_DELTA,
    });
  };

  return {
    isOpen,
    isLocating,
    isShowingUser,
    initialRegion: {
      ...start,
      latitudeDelta: OPEN_DELTA,
      longitudeDelta: OPEN_DELTA,
    } satisfies Region,
    valueText: value === undefined || value === null ? undefined : formatCoordinates(value),
    draftText: formatCoordinates(draft),
    onOpen: () => {
      const center = value ?? defaultCenter ?? DEFAULT_CENTER;
      setStart(center);
      setDraft(center);
      setIsOpen(true);
    },
    onClose: () => {
      setIsOpen(false);
      setIsShowingUser(false);
      setIsLocating(false);
      userCenterRef.current = undefined;
    },
    onRegionChangeComplete: (region: Region) => {
      setDraft({ latitude: region.latitude, longitude: region.longitude });
    },
    onConfirm: () => {
      const location: MapLocation = {
        latitude: round(draft.latitude),
        longitude: round(draft.longitude),
      };
      onChange(location);
    },
    onUseMyLocation: async () => {
      setIsLocating(true);
      if (await hasLocationAccess()) {
        setIsShowingUser(true);
        // The map is already tracking the user and will not report an unchanged position again.
        if (userCenterRef.current !== undefined) {
          setIsLocating(false);
          jumpTo(userCenterRef.current);
        }
      } else {
        setIsLocating(false);
        showDenied();
      }
    },
    onUserLocationChange: (event: {
      nativeEvent: { coordinate?: { latitude: number; longitude: number }; error?: unknown };
    }) => {
      const { coordinate, error } = event.nativeEvent;
      if (coordinate !== undefined) {
        const center = { latitude: coordinate.latitude, longitude: coordinate.longitude };
        userCenterRef.current = center;
        if (isLocating) {
          setIsLocating(false);
          jumpTo(center);
        }
      } else if (isLocating && error !== undefined) {
        setIsLocating(false);
        setIsShowingUser(false);
        showDenied();
      }
    },
  };
}
