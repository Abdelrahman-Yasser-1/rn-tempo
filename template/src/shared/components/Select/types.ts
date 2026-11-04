export type SelectOption = Readonly<{
  value: string;
  label: string;
  disabled?: boolean;
}>;

export type SelectProps = Readonly<{
  options: readonly SelectOption[];
  /** Selected option value, or `undefined` when nothing is selected. */
  value: string | undefined;
  onChange: (value: string) => void;
  label?: string;
  /** Adds a `*` marker to the label, announced as "required". Needs `label`. */
  required?: boolean;
  /** Secondary text next to the label, e.g. "(optional)". Needs `label`. */
  subLabel?: string;
  /** Help text revealed inline by an info button next to the label. Needs `label`. */
  tooltip?: string;
  /** Shown when nothing is selected; defaults to a translated generic prompt. */
  placeholder?: string;
  /** Title of the bottom sheet; falls back to `label`. */
  sheetTitle?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  /** Shows the value in a distinct, non-interactive style; the sheet can't be opened. */
  readOnly?: boolean;
  /** Puts a filter field at the top of the sheet (debounced); no matches show an empty state. */
  searchable?: boolean;
  testID?: string;
}>;
