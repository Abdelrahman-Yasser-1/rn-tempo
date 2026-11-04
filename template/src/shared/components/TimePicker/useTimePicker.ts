import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isAndroid } from '@shared/utils/platform';
import { formatTime, timeToDate, toTime } from '@shared/utils/time';

import { DEFAULT_TIME } from '../TimePickerSheet/useTimePickerSheet';

import type { TimePickerProps } from './types';

/**
 * Opens the time picker of the platform: Android shows its own system dialog (confirmed natively,
 * so no sheet and no draft); iOS opens the bottom sheet with the wheel. The system picker follows
 * the device language and 12 / 24 hour setting; the field text uses `Intl`.
 */
export function useTimePicker({
  value,
  onChange,
  formatValue = formatTime,
  minuteInterval,
}: Pick<TimePickerProps, 'value' | 'onChange' | 'formatValue' | 'minuteInterval'>) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const onOpen = () => {
    if (isAndroid) {
      DateTimePickerAndroid.open({
        mode: 'time',
        value: timeToDate(value ?? DEFAULT_TIME),
        minuteInterval,
        onValueChange: (_event, date) => {
          onChange(toTime(date));
        },
      });
    } else {
      setIsOpen(true);
    }
  };

  return {
    isOpen,
    hasSheet: !isAndroid,
    valueText: value === undefined || value === '' ? undefined : formatValue(value, i18n.language),
    onOpen,
    onClose: () => {
      setIsOpen(false);
    },
  };
}
