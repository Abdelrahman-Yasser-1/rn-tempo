export type NumberInputProps = Readonly<{
  /** Current value; a whole number between `min` and `max`. */
  value: number;
  onChange: (value: number) => void;
  /** Lowest value; defaults to 0 (the text field takes digits only). */
  min?: number;
  /** Highest value; defaults to no upper bound. */
  max?: number;
  /** Amount added or removed by the − and + buttons; defaults to 1. */
  step?: number;
  /** Text shown for the value while the field is not being edited, e.g. `(n) => `${n} kg``. */
  formatValue?: (value: number) => string;
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
  /** Shows the value in a distinct, non-editable style and disables the buttons. */
  readOnly?: boolean;
  /** Applied to the text field; the parts add suffixes (`.decrement`, `.increment`, `.label`, `.helper`, `.error`). */
  testID?: string;
}>;
