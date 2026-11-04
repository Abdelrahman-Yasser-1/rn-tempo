import { useState } from 'react';

import { timeToDate, toTime } from '@shared/utils/time';

import type { TimePickerSheetProps } from './types';

/** What the wheel shows when there is no value yet. */
export const DEFAULT_TIME = '09:00';

/**
 * Draft of the time sheet. The draft restarts from `value` whenever the sheet opens, so Cancel and
 * a swipe-down discard it. Confirm commits what the wheel shows, even when it was never moved.
 */
export function useTimePickerSheet({
  visible: isVisible,
  value,
  onConfirm,
}: Pick<TimePickerSheetProps, 'visible' | 'value' | 'onConfirm'>) {
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(isVisible);

  // Adjusting state while rendering is React's pattern for state derived from a prop change.
  if (isVisible !== wasVisible) {
    setWasVisible(isVisible);
    if (isVisible) {
      setDraft(value);
    }
  }

  const shown = draft ?? DEFAULT_TIME;

  return {
    date: timeToDate(shown),
    onChangeDate: (date: Date) => {
      setDraft(toTime(date));
    },
    onConfirmDraft: () => {
      onConfirm(shown);
    },
  };
}
