import type { IconName } from '@assets/generated/icons.types';

export type PickerFieldProps = Readonly<{
  label?: string;
  /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
  required?: boolean;
  /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
  subLabel?: string;
  /** Help text revealed inline by an info button next to the label. Needs `label`. */
  tooltip?: string;
  helperText?: string;
  /** Error message; also marks the field invalid and is announced politely. */
  errorText?: string;
  disabled?: boolean;
  /** Shows the value but never opens the picker. */
  readOnly?: boolean;
  /** Text of the current value, already formatted; the placeholder shows when it is missing. */
  valueText?: string;
  placeholder: string;
  /** Icon at the end of the field (hidden when read-only). */
  icon: IconName;
  /** Whether the picker this field opens is showing. */
  open?: boolean;
  onPress: () => void;
  /** Applied to the field; the parts add suffixes (`.value`, `.label`, `.helper`, `.error`). */
  testID?: string;
}>;
