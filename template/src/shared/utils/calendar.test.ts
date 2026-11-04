import {
  addDays,
  addMonths,
  clampISO,
  compareISO,
  firstDayOfWeekFor,
  formatDayNumber,
  formatFullDate,
  formatMonthYear,
  fromISODate,
  isDisabled,
  isSameDay,
  isValidISODate,
  monthGrid,
  monthLabels,
  parseYearMonth,
  toYearMonth,
  numeralLocale,
  toISODate,
  weekdayLabels,
} from './calendar';

describe('toISODate / fromISODate', () => {
  it('round-trips a local calendar date', () => {
    expect(toISODate(new Date(2026, 10, 4, 23, 59))).toBe('2026-11-04');
    const date = fromISODate('2026-11-04');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([
      2026, 10, 4, 0,
    ]);
  });

  it('pads small years and keeps them four digits', () => {
    expect(toISODate(fromISODate('0099-03-05'))).toBe('0099-03-05');
  });
});

describe('parseYearMonth / toYearMonth', () => {
  it('converts between YYYY-MM and a zero-based month', () => {
    expect(parseYearMonth('2026-11')).toEqual({ year: 2026, month: 10 });
    expect(parseYearMonth('2026-01-15')).toEqual({ year: 2026, month: 0 });
    expect(toYearMonth(2026, 10)).toBe('2026-11');
    expect(toYearMonth(99, 0)).toBe('0099-01');
  });
});

describe('isValidISODate', () => {
  it('accepts real days, including 29 February of a leap year', () => {
    expect(isValidISODate('2026-11-04')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('rejects malformed text and days that do not exist', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('2026-4-1')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });
});

describe('compareISO / isSameDay', () => {
  it('orders dates', () => {
    expect(compareISO('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareISO('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareISO('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('compares days', () => {
    expect(isSameDay('2026-01-01', '2026-01-01')).toBe(true);
    expect(isSameDay('2026-01-01', '2026-01-02')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('addMonths', () => {
  it('rolls over the year in both directions', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-03-10', 24)).toBe('2028-03-10');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('clampISO', () => {
  it('pulls a date into the range', () => {
    expect(clampISO('2026-01-01', '2026-02-01', '2026-03-01')).toBe('2026-02-01');
    expect(clampISO('2026-05-01', '2026-02-01', '2026-03-01')).toBe('2026-03-01');
    expect(clampISO('2026-02-15', '2026-02-01', '2026-03-01')).toBe('2026-02-15');
  });

  it('accepts open-ended ranges', () => {
    expect(clampISO('2026-01-01')).toBe('2026-01-01');
    expect(clampISO('2026-01-01', '2026-02-01')).toBe('2026-02-01');
    expect(clampISO('2026-05-01', undefined, '2026-03-01')).toBe('2026-03-01');
  });
});

describe('isDisabled', () => {
  const rules = {
    min: '2026-11-05',
    max: '2026-11-20',
    disabledDates: ['2026-11-10'],
    isDateDisabled: (iso: string) => iso === '2026-11-15',
  };

  it('is enabled inside the range', () => {
    expect(isDisabled('2026-11-05', rules)).toBe(false);
    expect(isDisabled('2026-11-20', rules)).toBe(false);
    expect(isDisabled('2026-11-12', rules)).toBe(false);
  });

  it('is disabled outside the range, on listed dates and by the predicate', () => {
    expect(isDisabled('2026-11-04', rules)).toBe(true);
    expect(isDisabled('2026-11-21', rules)).toBe(true);
    expect(isDisabled('2026-11-10', rules)).toBe(true);
    expect(isDisabled('2026-11-15', rules)).toBe(true);
  });

  it('is enabled without any rule', () => {
    expect(isDisabled('2026-11-04', {})).toBe(false);
  });
});

describe('monthGrid', () => {
  it('is always six weeks of seven days', () => {
    for (const [year, month] of [
      [2026, 1],
      [2026, 10],
      [2027, 0],
      [2024, 1],
    ] as const) {
      const grid = monthGrid(year, month, 0);
      expect(grid).toHaveLength(6);
      for (const week of grid) {
        expect(week).toHaveLength(7);
      }
    }
  });

  it('starts a Sunday-first November 2026 on Sunday 1 Nov', () => {
    const grid = monthGrid(2026, 10, 0);
    expect(grid[0]?.[0]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(grid[4]?.[1]).toEqual({ iso: '2026-11-30', day: 30, inMonth: true });
    expect(grid[5]?.[0]).toEqual({ iso: '2026-12-06', day: 6, inMonth: false });
  });

  it('starts a Saturday-first November 2026 with the previous Saturday', () => {
    const grid = monthGrid(2026, 10, 6);
    expect(grid[0]?.[0]).toEqual({ iso: '2026-10-31', day: 31, inMonth: false });
    expect(grid[0]?.[1]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
  });

  it('marks only the days of the month as inMonth', () => {
    const cells = monthGrid(2028, 1, 0).flat();
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(29);
    expect(cells.some((cell) => cell.iso === '2028-02-29' && cell.inMonth)).toBe(true);
  });

  it('rolls December into January', () => {
    const cells = monthGrid(2026, 11, 0).flat();
    expect(cells.at(-1)?.iso.startsWith('2027-01')).toBe(true);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it('defaults to Sunday first and keeps a month starting on the first column unpadded', () => {
    expect(monthGrid(2026, 1)[0]?.[0]?.iso).toBe('2026-02-01');
  });

  it('lists consecutive days', () => {
    const cells = monthGrid(2026, 10, 0).flat();
    for (const [index, cell] of cells.slice(1).entries()) {
      expect(cell.iso).toBe(addDays(cells[index]?.iso ?? '', 1));
    }
  });
});

describe('labels', () => {
  it('lists weekday names from the first day', () => {
    expect(weekdayLabels('en', 0, 'short')).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(weekdayLabels('en', 6, 'narrow')).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F']);
  });

  it('lists Arabic weekday names starting on Saturday', () => {
    const labels = weekdayLabels('ar', 6, 'short');
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe(
      new Intl.DateTimeFormat('ar', { weekday: 'short' }).format(new Date(2023, 0, 7)),
    );
  });

  it('lists twelve month names', () => {
    const months = monthLabels('en');
    expect(months).toHaveLength(12);
    expect(months[0]).toBe('January');
    expect(months[11]).toBe('December');
    expect(monthLabels('ar')).toHaveLength(12);
  });

  it('formats month and year', () => {
    expect(formatMonthYear('en', 2026, 10)).toBe('November 2026');
    expect(formatMonthYear('ar', 2026, 10)).toMatch(/2026/);
  });

  it('formats the full date used as a cell label', () => {
    expect(formatFullDate('2026-11-04', 'en')).toBe('Wednesday, November 4, 2026');
    expect(formatFullDate('2026-11-04', 'ar')).toMatch(/2026/);
  });

  it('keeps Latin digits in Arabic', () => {
    expect(formatDayNumber(14, 'ar')).toBe('14');
    expect(formatDayNumber(14, 'en')).toBe('14');
  });
});

describe('numeralLocale', () => {
  it('adds Latin numerals to Arabic locales only', () => {
    expect(numeralLocale('ar')).toBe('ar-u-nu-latn');
    expect(numeralLocale('ar-SA')).toBe('ar-SA-u-nu-latn');
    expect(numeralLocale('ar-SA-u-ca-islamic')).toBe('ar-SA-u-ca-islamic');
    expect(numeralLocale('en')).toBe('en');
  });
});

describe('firstDayOfWeekFor', () => {
  it('starts Arabic locales on Saturday and English on Sunday', () => {
    expect(firstDayOfWeekFor('ar')).toBe(6);
    expect(firstDayOfWeekFor('ar-SA')).toBe(6);
    expect(firstDayOfWeekFor('en')).toBe(0);
    expect(firstDayOfWeekFor('en-US')).toBe(0);
  });

  it('falls back to Sunday for other locales', () => {
    expect(firstDayOfWeekFor('fr')).toBe(0);
    expect(firstDayOfWeekFor('')).toBe(0);
  });
});
