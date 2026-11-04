import type { DayOfWeek } from '@shared/utils/calendar';

export type CalendarProps = Readonly<{
  /** Selected day as `YYYY-MM-DD`. */
  value?: string;
  /** Called with the tapped day as `YYYY-MM-DD`. */
  onChange: (iso: string) => void;
  /** Earliest selectable day (`YYYY-MM-DD`); earlier days are disabled. */
  minDate?: string;
  /** Latest selectable day (`YYYY-MM-DD`); later days are disabled. */
  maxDate?: string;
  /** Days that can't be selected. */
  disabledDates?: readonly string[];
  /** Disables any day for which it returns true, e.g. weekends. */
  isDateDisabled?: (iso: string) => boolean;
  /** Month shown first (`YYYY-MM` or `YYYY-MM-DD`); defaults to the value's month, else today's. */
  initialMonth?: string;
  /** 0 is Sunday, 6 is Saturday; defaults to the language's convention (Saturday for Arabic). */
  firstDayOfWeek?: DayOfWeek;
  /**
   * Replaces the number printed in a day cell, e.g. with a Hijri day. Receives the day as
   * `YYYY-MM-DD` and the default label. The cell's spoken label stays the full Gregorian date.
   */
  renderDayLabel?: (iso: string, defaultLabel: string) => string;
  /** Applied to the calendar; the parts add suffixes (`.day.<iso>`, `.prev`, `.next`, `.title`, `.months`). */
  testID?: string;
}>;
