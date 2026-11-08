import type { CalendarProps } from '@shared/components/Calendar';

export type DatePickerSheetProps = Readonly<
  Omit<CalendarProps, 'value' | 'onChange' | 'testID'> & {
    visible: boolean;
    /** Called after the sheet is dismissed, whether or not a date was confirmed. */
    onClose: () => void;
    /** The committed day (`YYYY-MM-DD`); the sheet opens with it as its draft. */
    value?: string;
    /** Called with the drafted day when Confirm is pressed. */
    onConfirm: (iso: string) => void;
    /** Defaults to a translated "Select a date". */
    title?: string;
    /** Applied to the sheet; the parts add suffixes (`.calendar`, `.cancel`, `.confirm`, `.close`). */
    testID?: string;
  }
>;
