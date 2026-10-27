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
  /** Shown when nothing is selected; defaults to a translated generic prompt. */
  placeholder?: string;
  /** Title of the bottom sheet; falls back to `label`. */
  sheetTitle?: string;
  helperText?: string;
  errorText?: string;
  disabled?: boolean;
  testID?: string;
}>;
