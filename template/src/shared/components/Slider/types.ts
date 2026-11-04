export type SliderProps = Readonly<{
  value: number;
  /** Called continuously while dragging and for every accessibility step. */
  onChange: (value: number) => void;
  /** Called once when the user lets go, and after each accessibility step. */
  onChangeEnd?: (value: number) => void;
  min: number;
  max: number;
  /** Distance between selectable values; defaults to 1. */
  step?: number;
  /** Shows the current (formatted) value next to the label. */
  showValue?: boolean;
  /** Text for a value, used for the shown value, the range labels and the screen reader; defaults to the number. */
  formatValue?: (value: number) => string;
  /** Text under the start edge of the track; defaults to the formatted `min`. */
  minLabel?: string;
  /** Text under the end edge of the track; defaults to the formatted `max`. */
  maxLabel?: string;
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
  /** Shows the value without letting the user change it. */
  readOnly?: boolean;
  /** Applied to the slider; the parts add suffixes (`.label`, `.value`, `.min`, `.max`, `.helper`, `.error`). */
  testID?: string;
}>;
