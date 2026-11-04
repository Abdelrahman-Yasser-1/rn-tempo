export type MultiSelectOption = Readonly<{
  value: string;
  label: string;
  /** Secondary line under the label in the sheet; also matched by the search. */
  description?: string;
  disabled?: boolean;
}>;

export type MultiSelectProps = Readonly<{
  options: readonly MultiSelectOption[];
  /** Selected option values. */
  value: readonly string[];
  onChange: (value: string[]) => void;
  /** Most options that can be selected; once reached the others are disabled and "Select all" is hidden. */
  maxSelected?: number;
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
  /** Error message; also marks the field invalid and is announced politely. */
  errorText?: string;
  disabled?: boolean;
  /** Shows the selection without removable chips; the sheet can't be opened. */
  readOnly?: boolean;
  /** Puts a filter field at the top of the sheet (debounced); no matches show an empty state. */
  searchable?: boolean;
  /** Applied to the field; the parts add suffixes (`.chip.<value>`, `.option.<value>`, `.search`, `.selectAll`, `.clear`, `.done`, `.close`, `.label`, `.helper`, `.error`). */
  testID?: string;
}>;
