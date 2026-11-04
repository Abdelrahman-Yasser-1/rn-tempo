import { formatTime, isValidTime, parseTime, timePeriod, timeToDate, toTime } from './time';

describe('isValidTime / parseTime', () => {
  it('accepts 24-hour HH:mm', () => {
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(parseTime('09:05')).toEqual({ hours: 9, minutes: 5 });
  });

  it('rejects anything else', () => {
    for (const value of ['24:00', '12:60', '9:05', '12:5', '', 'noon']) {
      expect(isValidTime(value)).toBe(false);
      expect(parseTime(value)).toBeUndefined();
    }
  });
});

describe('toTime / timeToDate', () => {
  it('formats the local time of a Date', () => {
    expect(toTime(new Date(2026, 10, 4, 7, 5))).toBe('07:05');
  });

  it('builds today at the given time', () => {
    const today = new Date(2026, 10, 4, 15, 40);
    const date = timeToDate('14:30', today);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 4]);
    expect(toTime(date)).toBe('14:30');
  });

  it('falls back to midnight for a missing or malformed time', () => {
    expect(toTime(timeToDate(undefined))).toBe('00:00');
    expect(toTime(timeToDate('bad'))).toBe('00:00');
  });
});

describe('formatTime', () => {
  it('formats with Intl in the locale', () => {
    expect(formatTime('14:30', 'en')).toMatch(/^2:30\s?PM$/);
    expect(formatTime('00:05', 'en')).toMatch(/^12:05\s?AM$/);
  });

  it('keeps Latin digits in Arabic', () => {
    expect(formatTime('14:30', 'ar')).toMatch(/^2:30/);
  });

  it('returns a non-time unchanged', () => {
    expect(formatTime('later', 'en')).toBe('later');
  });
});

describe('timePeriod', () => {
  it('splits the day at noon and 17:00', () => {
    expect(timePeriod('00:00')).toBe('morning');
    expect(timePeriod('11:59')).toBe('morning');
    expect(timePeriod('12:00')).toBe('afternoon');
    expect(timePeriod('16:59')).toBe('afternoon');
    expect(timePeriod('17:00')).toBe('evening');
    expect(timePeriod('23:59')).toBe('evening');
  });

  it('treats a malformed time as morning', () => {
    expect(timePeriod('bad')).toBe('morning');
  });
});
