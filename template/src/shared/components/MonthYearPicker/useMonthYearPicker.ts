import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMonthYear, parseYearMonth, toYearMonth } from '@shared/utils/calendar';

import type { MonthYearPickerProps } from './types';

const defaultFormat = (month: string, locale: string) => {
  const { year, month: index } = parseYearMonth(month);
  return formatMonthYear(locale, year, index);
};

type Draft = Readonly<{ year: number; month: number }>;

const toDraft = (value?: string): Draft | undefined =>
  value === undefined || value === '' ? undefined : parseYearMonth(value);

/**
 * Open state and the draft of the month sheet. The draft restarts from `value` whenever the sheet
 * opens, so Cancel and a swipe-down discard it, and `session` changes so the grid reopens on the
 * value's year.
 */
export function useMonthYearPicker({
  value,
  onChange,
  formatValue = defaultFormat,
}: Pick<MonthYearPickerProps, 'value' | 'onChange' | 'formatValue'>) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(value));
  const [session, setSession] = useState(0);
  // Read once on mount so the render stays pure.
  const [thisYear] = useState(() => new Date().getFullYear());

  const onOpen = () => {
    setDraft(toDraft(value));
    setSession((count) => count + 1);
    setIsOpen(true);
  };

  return {
    isOpen,
    session,
    gridYear: draft?.year ?? thisYear,
    gridMonth: draft?.month,
    hasDraft: draft !== undefined,
    valueText: value === undefined || value === '' ? undefined : formatValue(value, i18n.language),
    onOpen,
    onClose: () => {
      setIsOpen(false);
    },
    onSelect: (year: number, month: number) => {
      setDraft({ year, month });
    },
    onConfirm: () => {
      if (draft !== undefined) {
        onChange(toYearMonth(draft.year, draft.month));
      }
    },
  };
}
