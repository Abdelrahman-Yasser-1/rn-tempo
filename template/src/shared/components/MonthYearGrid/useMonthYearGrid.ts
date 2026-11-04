import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';
import { formatMonthYear, monthLabels, parseYearMonth } from '@shared/utils/calendar';

import type { MonthYearGridProps } from './types';

/** Years listed before the current year when there is no `minMonth`, and after it without `maxMonth`. */
const YEARS_BEFORE = 100;
const YEARS_AFTER = 20;
export const YEAR_ROW_HEIGHT = MIN_TOUCH_TARGET;

/**
 * Logic of the month/year grid: the year being browsed, the year list bounds and which months are
 * out of range.
 */
export function useMonthYearGrid({
  year,
  month,
  onSelect,
  minMonth,
  maxMonth,
}: Pick<MonthYearGridProps, 'year' | 'month' | 'onSelect' | 'minMonth' | 'maxMonth'>) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const [browsedYear, setBrowsedYear] = useState(year);
  // Read once on mount so the render stays pure.
  const [thisYear] = useState(() => new Date().getFullYear());

  const min = minMonth === undefined ? undefined : parseYearMonth(minMonth);
  const max = maxMonth === undefined ? undefined : parseYearMonth(maxMonth);
  const firstYear = Math.min(min?.year ?? thisYear - YEARS_BEFORE, year);
  const lastYear = Math.max(max?.year ?? thisYear + YEARS_AFTER, year);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);

  const isMonthDisabled = (candidate: number) => {
    const index = browsedYear * 12 + candidate;
    return (
      (min !== undefined && index < min.year * 12 + min.month) ||
      (max !== undefined && index > max.year * 12 + max.month)
    );
  };

  const isYearDisabled = (candidate: number) =>
    (min !== undefined && candidate < min.year) || (max !== undefined && candidate > max.year);

  return {
    names: monthLabels(locale),
    years,
    browsedYear,
    initialYearIndex: Math.max(0, years.indexOf(year)),
    isMonthDisabled,
    isYearDisabled,
    monthLabel: (candidate: number) => formatMonthYear(locale, browsedYear, candidate),
    onYearPress: setBrowsedYear,
    onMonthPress: (candidate: number) => {
      onSelect(browsedYear, candidate);
    },
    // Only the browsed year of the selection shows a selected month.
    isMonthSelected: (candidate: number) => browsedYear === year && month === candidate,
  };
}
