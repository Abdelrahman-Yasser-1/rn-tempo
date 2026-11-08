import type { RefObject } from 'react';
import type MapView from 'react-native-maps';

import type { PickerFieldProps } from '@shared/components/PickerField';

/** A chosen place. `address` is optional and never filled in by the picker itself. */
export type MapLocation = Readonly<{
  latitude: number;
  longitude: number;
  address?: string;
}>;

/** Where the map opens when there is no value yet. */
export type MapCenter = Readonly<{ latitude: number; longitude: number }>;

export type MapPickerProps = Readonly<
  Pick<
    PickerFieldProps,
    | 'label'
    | 'required'
    | 'subLabel'
    | 'tooltip'
    | 'helperText'
    | 'errorText'
    | 'disabled'
    | 'readOnly'
  > & {
    /** The chosen place, or `null`/`undefined` when there is none. */
    value?: MapLocation | null;
    /** Called with the place under the centre pin when the user confirms. */
    onChange: (location: MapLocation) => void;
    /** Where the map opens without a value; defaults to Riyadh. */
    defaultCenter?: MapCenter;
    /** Offers the "use my location" button (it asks for permission only when pressed); on by default. */
    showMyLocation?: boolean;
    /** Shown when there is no value; defaults to a translated "Choose a location". */
    placeholder?: string;
    /** Title of the sheet; falls back to `label`, then to a translated "Choose a location". */
    sheetTitle?: string;
    /** Applied to the field; the parts add suffixes (`.sheet`, `.map`, `.my-location`, `.value`, `.label`, `.helper`, `.error`). */
    testID?: string;
  }
>;

export type UseMapPickerOptions = Readonly<
  Pick<MapPickerProps, 'value' | 'onChange' | 'defaultCenter'> & {
    mapRef: RefObject<MapView | null>;
  }
>;
