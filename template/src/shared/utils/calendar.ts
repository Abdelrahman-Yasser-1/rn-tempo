/**
 * Calendar maths on local calendar dates.
 *
 * Dates travel as ISO `YYYY-MM-DD` strings so no time zone can shift them. `month` is the
 * zero-based JS month (0 is January) everywhere in this file; `YYYY-MM` strings are one-based.
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type GridCell = Readonly<{
  iso: string;
  day: number;
  /** False for the leading and trailing days of the neighbouring months. */
  inMonth: boolean;
}>;

export type DisabledRules = Readonly<{
  min?: string;
  max?: string;
  disabledDates?: readonly string[];
  isDateDisabled?: (iso: string) => boolean;
}>;

export const WEEKS_IN_GRID = 6;
export const DAYS_IN_WEEK = 7;

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 2023-01-01 was a Sunday, so day `n` of that January is weekday `n - 1`.
const SUNDAY_YEAR = 2023;

/**
 * First day of the week per language (0 is Sunday, 6 is Saturday). Arabic and Saudi Arabia start
 * on Saturday; everything else, English included, on Sunday. Edit the map to change a locale.
 */
const FIRST_DAY_OF_WEEK: Readonly<Record<string, DayOfWeek>> = { ar: 6, en: 0 };
const DEFAULT_FIRST_DAY: DayOfWeek = 0;

const pad = (value: number, length: number) => String(value).padStart(length, '0');

/**
 * Locale for rendering numerals: Arabic keeps Latin digits, like `formatNumber` output elsewhere
 * in the app, while month and weekday names stay Arabic.
 */
export function numeralLocale(locale: string): string {
  return locale.startsWith('ar') && !locale.includes('-u-') ? `${locale}-u-nu-latn` : locale;
}

/** Local `YYYY-MM-DD` of a Date. */
export function toISODate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Splits `YYYY-MM` (or any longer ISO date) into a year and a zero-based month. */
export function parseYearMonth(value: string): { year: number; month: number } {
  const [year, month] = value.split('-').map(Number) as [number, number];
  return { year, month: month - 1 };
}

/** `YYYY-MM` for a year and a zero-based month. */
export function toYearMonth(year: number, month: number): string {
  return `${pad(year, 4)}-${pad(month + 1, 2)}`;
}

/** Local midnight of a `YYYY-MM-DD` string. */
export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  // `new Date(99, …)` maps to 1999; pin the year for every four-digit value.
  date.setFullYear(year);
  return date;
}

/** True for a well-formed `YYYY-MM-DD` that is a real calendar day (not 2026-02-30). */
export function isValidISODate(value: string): boolean {
  if (!ISO_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = fromISODate(value);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

/** Orders two ISO dates: -1 when `a` is earlier, 1 when later, 0 when the same day. */
export function compareISO(a: string, b: string): -1 | 0 | 1 {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Whether both ISO dates are the same calendar day. */
export function isSameDay(a: string, b: string): boolean {
  return compareISO(a, b) === 0;
}

/** Moves by whole days across month and year ends. */
export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Moves by whole months and keeps the day, or the last day of a shorter month (Jan 31 → Feb 28). */
export function addMonths(iso: string, months: number): string {
  const date = fromISODate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toISODate(date);
}

/** Pulls `iso` into `[min, max]`; either bound may be missing. */
export function clampISO(iso: string, min?: string, max?: string): string {
  const lower = min !== undefined && compareISO(iso, min) < 0 ? min : iso;
  return max !== undefined && compareISO(lower, max) > 0 ? max : lower;
}

/** Whether a date falls outside `min`/`max`, is listed in `disabledDates` or fails the predicate. */
export function isDisabled(
  iso: string,
  { min, max, disabledDates, isDateDisabled }: DisabledRules,
): boolean {
  return (
    (min !== undefined && compareISO(iso, min) < 0) ||
    (max !== undefined && compareISO(iso, max) > 0) ||
    (disabledDates?.includes(iso) ?? false) ||
    (isDateDisabled?.(iso) ?? false)
  );
}

/** Six weeks of seven days for a month, starting on `firstDayOfWeek`; always 42 cells. */
export function monthGrid(
  year: number,
  month: number,
  firstDayOfWeek: DayOfWeek = DEFAULT_FIRST_DAY,
): GridCell[][] {
  const first = new Date(year, month, 1);
  first.setFullYear(year);
  const lead = (first.getDay() - firstDayOfWeek + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const firstISO = toISODate(first);
  const monthPrefix = firstISO.slice(0, 7);

  return Array.from({ length: WEEKS_IN_GRID }, (_, week) =>
    Array.from({ length: DAYS_IN_WEEK }, (_, dayIndex): GridCell => {
      const iso = addDays(firstISO, week * DAYS_IN_WEEK + dayIndex - lead);
      return { iso, day: Number(iso.slice(8)), inMonth: iso.startsWith(monthPrefix) };
    }),
  );
}

/** Weekday names in column order, starting on `firstDayOfWeek`. */
export function weekdayLabels(
  locale: string,
  firstDayOfWeek: DayOfWeek,
  width: 'narrow' | 'short',
): string[] {
  const format = new Intl.DateTimeFormat(numeralLocale(locale), { weekday: width });
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    format.format(new Date(SUNDAY_YEAR, 0, 1 + ((firstDayOfWeek + index) % DAYS_IN_WEEK))),
  );
}

/** The twelve month names, January first. */
export function monthLabels(locale: string): string[] {
  const format = new Intl.DateTimeFormat(numeralLocale(locale), { month: 'long' });
  return Array.from({ length: 12 }, (_, month) => format.format(new Date(SUNDAY_YEAR, month, 1)));
}

/** "November 2026" in the locale. */
export function formatMonthYear(locale: string, year: number, month: number): string {
  const date = new Date(year, month, 1);
  date.setFullYear(year);
  return new Intl.DateTimeFormat(numeralLocale(locale), { month: 'long', year: 'numeric' }).format(
    date,
  );
}

/** "Tuesday, 4 November 2026"; the spoken label of a day cell. */
export function formatFullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(numeralLocale(locale), { dateStyle: 'full' }).format(
    fromISODate(iso),
  );
}

/** The day of the month as shown in a cell. */
export function formatDayNumber(day: number, locale: string): string {
  return new Intl.NumberFormat(numeralLocale(locale)).format(day);
}

/** First day of the week for a locale such as `ar`, `ar-SA` or `en-US`. */
export function firstDayOfWeekFor(locale: string): DayOfWeek {
  const language = locale.replace(/-.*/, '').toLowerCase();
  return FIRST_DAY_OF_WEEK[language] ?? DEFAULT_FIRST_DAY;
}
