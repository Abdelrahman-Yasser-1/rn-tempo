import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatRelativeTime,
} from './format';

const NOW = new Date(2026, 9, 27, 12, 0, 0);

describe('formatDate', () => {
  it('formats with the requested style and locale', () => {
    expect(formatDate(NOW, 'medium', 'en-US')).toBe('Oct 27, 2026');
    expect(formatDate(NOW, 'short', 'en-US')).toBe('10/27/26');
  });

  it('accepts a timestamp as well as a Date', () => {
    expect(formatDate(NOW.getTime(), 'medium', 'en-US')).toBe('Oct 27, 2026');
  });
});

describe('formatRelativeTime', () => {
  it('describes past times relative to now', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo, 'en-US', NOW)).toBe('2 hours ago');
  });

  it('describes future times relative to now', () => {
    const inThreeDays = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(inThreeDays, 'en-US', NOW)).toBe('in 3 days');
  });

  it('uses natural wording for one unit away', () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(yesterday, 'en-US', NOW)).toBe('yesterday');
  });

  it('says "now" for the current instant', () => {
    expect(formatRelativeTime(NOW, 'en-US', NOW)).toBe('now');
  });

  it('falls back to a short absolute date when Intl.RelativeTimeFormat is missing', () => {
    const original = Intl.RelativeTimeFormat;
    Object.assign(Intl, { RelativeTimeFormat: undefined });
    try {
      expect(formatRelativeTime(NOW, 'en-US', NOW)).toBe('10/27/26');
    } finally {
      Object.assign(Intl, { RelativeTimeFormat: original });
    }
  });
});

describe('formatNumber', () => {
  it('uses the locale separators', () => {
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'de-DE')).toBe('1.234,5');
  });

  it('applies Intl options', () => {
    expect(formatNumber(0.256, 'en-US', { style: 'percent' })).toBe('26%');
  });
});

describe('formatCurrency', () => {
  it('formats an amount with its currency symbol and two decimals', () => {
    expect(formatCurrency(5, 'USD', 'en-US')).toBe('$5.00');
  });
});
