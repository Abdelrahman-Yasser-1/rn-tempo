export type TimePickerSheetProps = Readonly<{
  visible: boolean;
  /** Called after the sheet is dismissed, whether or not a time was confirmed. */
  onClose: () => void;
  /** The committed time as 24-hour `HH:mm`; the sheet opens with it as its draft. */
  value?: string;
  /** Called with the drafted `HH:mm` when Confirm is pressed. */
  onConfirm: (time: string) => void;
  /** Defaults to a translated "Select a time". */
  title?: string;
  /** Minutes step of the wheel (1, 5, 10, 15, 30...). */
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  /** Applied to the sheet; the parts add suffixes (`.picker`, `.cancel`, `.confirm`, `.close`). */
  testID?: string;
}>;
