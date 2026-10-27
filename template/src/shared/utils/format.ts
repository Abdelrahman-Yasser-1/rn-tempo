export type DateStyle = 'short' | 'medium' | 'long' | 'full';

const SECOND_MS = 1000;
const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * SECOND_MS },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * SECOND_MS },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * SECOND_MS },
  { unit: 'day', ms: 24 * 60 * 60 * SECOND_MS },
  { unit: 'hour', ms: 60 * 60 * SECOND_MS },
  { unit: 'minute', ms: 60 * SECOND_MS },
  { unit: 'second', ms: SECOND_MS },
];

/** Formats a date with `Intl.DateTimeFormat` (`short` 1/2/26, `medium`, `long`, `full`). */
export function formatDate(date: Date | number, style: DateStyle, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(date);
}

/**
 * Formats a date relative to `now` ("2 hours ago", "in 3 days") with `Intl.RelativeTimeFormat`.
 * Hermes builds without that API fall back to a short absolute date.
 */
export function formatRelativeTime(
  date: Date | number,
  locale: string,
  now: Date | number = Date.now(),
): string {
  if (typeof Intl.RelativeTimeFormat === 'undefined') {
    return formatDate(date, 'short', locale);
  }
  const diff = new Date(date).getTime() - new Date(now).getTime();
  const { unit, ms } = UNITS.find((entry) => Math.abs(diff) >= entry.ms) ?? {
    unit: 'second' as const,
    ms: SECOND_MS,
  };
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    Math.round(diff / ms),
    unit,
  );
}

/** Formats a number using the locale's separators and digits. */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Formats an amount as currency, e.g. `formatCurrency(5, 'USD', 'en')` is `$5.00`. */
export function formatCurrency(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
