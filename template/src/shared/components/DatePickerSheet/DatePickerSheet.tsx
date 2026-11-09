import { useTranslation } from 'react-i18next';

import { Calendar } from '@shared/components/Calendar';
import { PickerSheet } from '@shared/components/PickerSheet';

import type { DatePickerSheetProps } from './types';
import { useDatePickerSheet } from './useDatePickerSheet';

/**
 * Bottom sheet with a `Calendar`. The selection is a draft: it only reaches `onConfirm` when
 * Confirm is pressed, and Cancel, the close button or a swipe discard it.
 */
export function DatePickerSheet({
  visible: isVisible,
  onClose,
  value,
  onConfirm,
  title,
  testID,
  ...calendarProps
}: DatePickerSheetProps) {
  const { t } = useTranslation();
  const vm = useDatePickerSheet({ visible: isVisible, value, onConfirm });

  return (
    <PickerSheet
      visible={isVisible}
      title={title ?? t(($) => $.datePicker.title)}
      testID={testID}
      confirmDisabled={vm.draft === undefined}
      onClose={onClose}
      onConfirm={vm.onConfirmDraft}
    >
      <Calendar
        key={vm.session}
        {...calendarProps}
        testID={testID ? `${testID}.calendar` : undefined}
        value={vm.draft}
        onChange={vm.onSelect}
      />
    </PickerSheet>
  );
}
