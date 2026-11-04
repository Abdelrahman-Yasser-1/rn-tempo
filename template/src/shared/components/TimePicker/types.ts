import type { PickerFieldProps } from '../PickerField';
import type { TimePickerSheetProps } from '../TimePickerSheet';

export type TimePickerProps = Readonly<
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
  > &
    Pick<TimePickerSheetProps, 'minuteInterval'> & {
      /** The chosen time as 24-hour `HH:mm`. */
      value?: string;
      /** Called with the new `HH:mm` when the user confirms it. */
      onChange: (time: string) => void;
      /** Shown when there is no value; defaults to a translated "Select a time". */
      placeholder?: string;
      /** Title of the iOS sheet; falls back to `label`, then to a translated "Select a time". */
      sheetTitle?: string;
      /** Text of the value in the field; defaults to the locale's short time ("2:30 PM"). */
      formatValue?: (time: string, locale: string) => string;
      /** Applied to the field; the parts add suffixes (`.value`, `.sheet`, `.label`, `.helper`, `.error`). */
      testID?: string;
    }
>;
