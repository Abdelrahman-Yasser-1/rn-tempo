import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fromISODate } from '@shared/utils/calendar';
import { formatTime, timePeriod } from '@shared/utils/time';
import type { TimePeriod } from '@shared/utils/time';

import type { TimeSlot, TimeSlotPickerProps } from './types';

const PERIODS: readonly TimePeriod[] = ['morning', 'afternoon', 'evening'];

/**
 * Logic of the time slot picker: open state, the slots grouped by period (morning, afternoon,
 * evening; empty groups are left out), the text of the chosen slot and the sheet title.
 */
export function useTimeSlotPicker({
  slots,
  value,
  onChange,
  date,
  label,
  sheetTitle,
}: Pick<TimeSlotPickerProps, 'slots' | 'value' | 'onChange' | 'date' | 'label' | 'sheetTitle'>) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [isOpen, setIsOpen] = useState(false);

  const periodLabels: Record<TimePeriod, string> = {
    morning: t('timeSlot.period.morning'),
    afternoon: t('timeSlot.period.afternoon'),
    evening: t('timeSlot.period.evening'),
  };
  const slotText = (slot: TimeSlot) => slot.label ?? formatTime(slot.value, locale);
  const groups = PERIODS.map((period) => ({
    period,
    title: periodLabels[period],
    slots: slots.filter((slot) => timePeriod(slot.value) === period),
  })).filter((group) => group.slots.length > 0);

  const selected = slots.find((slot) => slot.value === value);
  let title = sheetTitle ?? label ?? t('timeSlot.title');
  if (sheetTitle === undefined && date !== undefined) {
    title = t('timeSlot.titleOnDate', { date: fromISODate(date) });
  }

  let valueText: string | undefined;
  if (value !== undefined && value !== '') {
    valueText = selected ? slotText(selected) : formatTime(value, locale);
  }

  return {
    isOpen,
    groups,
    title,
    hasSlots: slots.length > 0,
    slotText,
    valueText,
    onOpen: () => {
      setIsOpen(true);
    },
    onClose: () => {
      setIsOpen(false);
    },
    onSelect: (slotValue: string) => {
      onChange(slotValue);
      setIsOpen(false);
    },
  };
}
