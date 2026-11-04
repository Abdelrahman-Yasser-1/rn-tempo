import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fromISODate, numeralLocale } from '@shared/utils/calendar';
import { formatDate } from '@shared/utils/format';

import type { DatePickerProps } from './types';

const defaultFormat = (iso: string, locale: string) =>
  formatDate(fromISODate(iso), 'medium', numeralLocale(locale));

/** Open state of the sheet and the formatted text of the value. */
export function useDatePicker({
  value,
  onChange,
  formatValue = defaultFormat,
}: Pick<DatePickerProps, 'value' | 'onChange' | 'formatValue'>) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    valueText: value === undefined || value === '' ? undefined : formatValue(value, i18n.language),
    onOpen: () => {
      setIsOpen(true);
    },
    onClose: () => {
      setIsOpen(false);
    },
    onConfirm: onChange,
  };
}
