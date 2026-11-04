import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  addDays,
  clampISO,
  firstDayOfWeekFor,
  formatDayNumber,
  formatFullDate,
  formatMonthYear,
  isDisabled,
  isSameDay,
  monthGrid,
  parseYearMonth,
  toISODate,
  weekdayLabels,
} from '@shared/utils/calendar';

import type { CalendarProps } from './types';

type View = Readonly<{ year: number; month: number }>;

/** First day of the month `offset` months after `view`, as an ISO date. */
const firstOfMonth = ({ year, month }: View, offset: number) =>
  toISODate(new Date(year, month + offset, 1));

/**
 * Logic of the calendar: the month on screen, the days / months switch, the day cells with their
 * state and labels, and the month stepping bounds from `minDate` and `maxDate`.
 */
export function useCalendar({
  value,
  onChange,
  minDate,
  maxDate,
  disabledDates,
  isDateDisabled,
  initialMonth,
  firstDayOfWeek,
  renderDayLabel,
}: Pick<
  CalendarProps,
  | 'value'
  | 'onChange'
  | 'minDate'
  | 'maxDate'
  | 'disabledDates'
  | 'isDateDisabled'
  | 'initialMonth'
  | 'firstDayOfWeek'
  | 'renderDayLabel'
>) {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const firstDay = firstDayOfWeek ?? firstDayOfWeekFor(locale);
  // Read once on mount so the render stays pure; a calendar left open past midnight is rare.
  const [today] = useState(() => toISODate(new Date()));

  const [view, setView] = useState<View>(() =>
    parseYearMonth(initialMonth ?? clampISO(value ?? today, minDate, maxDate)),
  );
  const [isPickingMonth, setIsPickingMonth] = useState(false);

  const grid = monthGrid(view.year, view.month, firstDay);
  const monthStart = firstOfMonth(view, 0);
  const monthEnd = addDays(firstOfMonth(view, 1), -1);
  const rules = { min: minDate, max: maxDate, disabledDates, isDateDisabled };

  const weeks = grid.map((week) =>
    week.map((cell) => {
      const defaultLabel = formatDayNumber(cell.day, locale);
      return {
        ...cell,
        label: renderDayLabel?.(cell.iso, defaultLabel) ?? defaultLabel,
        accessibilityLabel: formatFullDate(cell.iso, locale),
        isSelected: value !== undefined && isSameDay(cell.iso, value),
        isToday: isSameDay(cell.iso, today),
        isDisabled: isDisabled(cell.iso, rules),
      };
    }),
  );

  const step = (months: number) => {
    setView(({ year, month }) => {
      const date = new Date(year, month + months, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  return {
    locale,
    // Narrow names repeat (S, T), so each column is keyed by the first week's date in it.
    weekdays: weekdayLabels(locale, firstDay, 'narrow').map((label, index) => ({
      label,
      key: grid[0]?.[index]?.iso ?? label,
    })),
    weeks,
    year: view.year,
    month: view.month,
    title: formatMonthYear(locale, view.year, view.month),
    canGoPrevious: minDate === undefined || monthStart > minDate,
    canGoNext: maxDate === undefined || monthEnd < maxDate,
    minMonth: minDate?.slice(0, 7),
    maxMonth: maxDate?.slice(0, 7),
    isPickingMonth,
    onPrevious: () => {
      step(-1);
    },
    onNext: () => {
      step(1);
    },
    onToggleMonthPicker: () => {
      setIsPickingMonth((isOpen) => !isOpen);
    },
    onPickMonth: (year: number, month: number) => {
      setView({ year, month });
      setIsPickingMonth(false);
    },
    onSelect: onChange,
  };
}
