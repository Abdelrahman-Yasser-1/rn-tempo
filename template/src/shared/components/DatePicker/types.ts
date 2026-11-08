import type { DatePickerSheetProps } from '@shared/components/DatePickerSheet';
import type { PickerFieldProps } from '@shared/components/PickerField';

export type DatePickerProps = Readonly<
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
    Pick<
      DatePickerSheetProps,
      | 'minDate'
      | 'maxDate'
      | 'disabledDates'
      | 'isDateDisabled'
      | 'initialMonth'
      | 'firstDayOfWeek'
      | 'renderDayLabel'
    > & {
      /** The chosen day as `YYYY-MM-DD`. */
      value?: string;
      /** Called with the new day when the user confirms it in the sheet. */
      onChange: (iso: string) => void;
      /** Shown when there is no value; defaults to a translated "Select a date". */
      placeholder?: string;
      /** Title of the sheet; falls back to `label`, then to a translated "Select a date". */
      sheetTitle?: string;
      /** Text of the value in the field; defaults to the locale's medium date ("Nov 4, 2026"). */
      formatValue?: (iso: string, locale: string) => string;
      /** Applied to the field; the parts add suffixes (`.value`, `.sheet`, `.label`, `.helper`, `.error`). */
      testID?: string;
    }
>;
