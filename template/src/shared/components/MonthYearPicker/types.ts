import type { PickerFieldProps } from '../PickerField';

export type MonthYearPickerProps = Readonly<
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
    /** The chosen month as `YYYY-MM`. */
    value?: string;
    /** Called with the new `YYYY-MM` when the user confirms it in the sheet. */
    onChange: (month: string) => void;
    /** Earliest selectable month as `YYYY-MM`. */
    minMonth?: string;
    /** Latest selectable month as `YYYY-MM`. */
    maxMonth?: string;
    /** Shown when there is no value; defaults to a translated "Select month and year". */
    placeholder?: string;
    /** Title of the sheet; falls back to `label`, then to a translated "Select month and year". */
    sheetTitle?: string;
    /** Text of the value in the field; defaults to the locale's "November 2026". */
    formatValue?: (month: string, locale: string) => string;
    /** Applied to the field; the parts add suffixes (`.value`, `.sheet`, `.grid`, `.label`, `.helper`, `.error`). */
    testID?: string;
  }
>;
