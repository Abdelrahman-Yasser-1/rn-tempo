import { numeralLocale } from './calendar';

/**
 * Time-of-day helpers. A time travels as a 24-hour `HH:mm` string, so no time zone or date can
 * shift it; `Date` objects only exist at the edge of the native time picker.
 */

export type TimePeriod = 'morning' | 'afternoon' | 'evening';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NOON_HOUR = 12;
const EVENING_HOUR = 17;

const pad = (value: number) => String(value).padStart(2, '0');

/** Whether `value` is a 24-hour `HH:mm` time (`00:00` to `23:59`). */
export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Splits `HH:mm` into numbers, or `undefined` for anything else. */
export function parseTime(value: string): { hours: number; minutes: number } | undefined {
  const match = TIME_PATTERN.exec(value);
  return match ? { hours: Number(match[1]), minutes: Number(match[2]) } : undefined;
}

/** `HH:mm` of a Date's local time. */
export function toTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today at `value` (local time), for the native picker; midnight when `value` is not a time. */
export function timeToDate(value: string | undefined, today: Date = new Date()): Date {
  const { hours, minutes } = (value === undefined ? undefined : parseTime(value)) ?? {
    hours: 0,
    minutes: 0,
  };
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
}

/**
 * Formats `HH:mm` for display with `Intl` ("2:30 PM" in English). Arabic keeps Latin digits like
 * the rest of the app. A string that is not a time is returned unchanged.
 */
export function formatTime(value: string, locale: string): string {
  const parsed = parseTime(value);
  if (parsed === undefined) {
    return value;
  }
  const numerals = numeralLocale(locale);
  return new Intl.DateTimeFormat(numerals, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(2023, 0, 1, parsed.hours, parsed.minutes),
  );
}

/** Morning until 11:59, afternoon until 16:59, evening after. */
export function timePeriod(value: string): TimePeriod {
  const hours = parseTime(value)?.hours ?? 0;
  if (hours < NOON_HOUR) {
    return 'morning';
  }
  return hours < EVENING_HOUR ? 'afternoon' : 'evening';
}
