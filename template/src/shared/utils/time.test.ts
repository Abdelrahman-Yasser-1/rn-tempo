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

describe('time edge cases', () => {
  it('accepts the first and last minute of the day and rejects padding or out-of-range parts', () => {
    expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
    for (const value of [' 09:00', '09:00 ', '09:00:00', '23:60', '-1:00', '09-00']) {
      expect(isValidTime(value)).toBe(false);
    }
  });

  it('pads midnight and single digits', () => {
    expect(toTime(new Date(2026, 10, 4, 0, 0))).toBe('00:00');
    expect(toTime(new Date(2026, 10, 4, 9, 5))).toBe('09:05');
    expect(toTime(new Date(2026, 10, 4, 23, 59))).toBe('23:59');
  });

  it('round-trips every hour through a Date', () => {
    for (let hours = 0; hours < 24; hours += 1) {
      const value = `${String(hours).padStart(2, '0')}:07`;
      expect(toTime(timeToDate(value))).toBe(value);
    }
  });

  it('builds the date from the local calendar day of the reference, not from UTC', () => {
    const lateNight = new Date(2026, 11, 31, 23, 59);
    const date = timeToDate('00:30', lateNight);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 11, 31]);
  });

  it('formats noon and midnight in English', () => {
    expect(formatTime('12:00', 'en')).toMatch(/^12:00\sPM$/);
    expect(formatTime('00:00', 'en')).toMatch(/^12:00\sAM$/);
    expect(formatTime('23:59', 'en')).toMatch(/^11:59\sPM$/);
  });

  it('formats Arabic with Latin digits and an Arabic day period', () => {
    const text = formatTime('14:30', 'ar');
    expect(text).toMatch(/^2:30/);
    expect(text).toMatch(/\p{Script=Arabic}/u);
    expect(text).not.toMatch(/[\u0660-\u0669]/);
  });

  it('returns an invalid time unchanged in every language', () => {
    expect(formatTime('', 'ar')).toBe('');
    expect(formatTime('25:00', 'en')).toBe('25:00');
  });
});
