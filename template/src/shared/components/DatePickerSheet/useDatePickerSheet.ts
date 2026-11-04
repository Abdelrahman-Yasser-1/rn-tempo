import { useState } from 'react';

import type { DatePickerSheetProps } from './types';

/**
 * Draft of the date sheet. The draft restarts from `value` whenever the sheet opens, so Cancel and
 * a swipe-down discard it, and `session` changes so the calendar reopens on the value's month.
 */
export function useDatePickerSheet({
  visible: isVisible,
  value,
  onConfirm,
}: Pick<DatePickerSheetProps, 'visible' | 'value' | 'onConfirm'>) {
  const [draft, setDraft] = useState(value);
  const [wasVisible, setWasVisible] = useState(isVisible);
  const [session, setSession] = useState(0);

  // Adjusting state while rendering is React's pattern for state derived from a prop change.
  if (isVisible !== wasVisible) {
    setWasVisible(isVisible);
    if (isVisible) {
      setDraft(value);
      setSession((count) => count + 1);
    }
  }

  return {
    draft,
    session,
    onSelect: setDraft,
    onConfirmDraft: () => {
      if (draft !== undefined) {
        onConfirm(draft);
      }
    },
  };
}
