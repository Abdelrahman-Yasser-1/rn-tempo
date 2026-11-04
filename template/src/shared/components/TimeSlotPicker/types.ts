import type { PickerFieldProps } from '../PickerField';

export type TimeSlot = Readonly<{
  /** The slot's start as 24-hour `HH:mm`; also the picker's value. */
  value: string;
  /** Text of the chip; defaults to the formatted time ("9:00 AM"). */
  label?: string;
  disabled?: boolean;
}>;

export type TimeSlotPickerProps = Readonly<
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
    slots: readonly TimeSlot[];
    /** The chosen slot's `value` (`HH:mm`). */
    value?: string;
    /** Called with the tapped slot's `value`; the sheet closes after it. */
    onChange: (value: string) => void;
    /** The day the slots belong to (`YYYY-MM-DD`); the sheet title says "Slots for <date>". */
    date?: string;
    /** Shown when there is no value; defaults to a translated "Select a time slot". */
    placeholder?: string;
    /** Title of the sheet; overrides the one built from `date`, `label` or the default. */
    sheetTitle?: string;
    /** Applied to the field; the parts add suffixes (`.value`, `.sheet`, `.slot.<value>`, `.empty`, `.label`, `.helper`, `.error`). */
    testID?: string;
  }
>;
