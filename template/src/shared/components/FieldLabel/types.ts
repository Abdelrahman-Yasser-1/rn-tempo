export type FieldLabelProps = Readonly<{
  label: string;
  /** Appends a `*` marker that screen readers announce as "required". */
  required?: boolean;
  /** Secondary text shown next to the label, e.g. "(optional)". */
  subLabel?: string;
  /** Help text revealed inline by a small info button next to the label. */
  tooltip?: string;
  /** Applied to the label text; the parts add suffixes (`.required`, `.subLabel`, `.tooltip`, `.hint`). */
  testID?: string;
}>;
