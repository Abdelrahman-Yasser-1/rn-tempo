import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useUnistyles } from 'react-native-unistyles';

import { PickerSheet } from '@shared/components/PickerSheet';

import type { TimePickerSheetProps } from './types';
import { useTimePickerSheet } from './useTimePickerSheet';

/**
 * Bottom sheet with the native iOS time wheel. The selection is a draft: it only reaches
 * `onConfirm` when Confirm is pressed, and Cancel, the close button or a swipe discard it.
 * Android uses its own system dialog instead (see `TimePicker`), so this sheet is for iOS.
 */
export function TimePickerSheet({
  visible: isVisible,
  onClose,
  value,
  onConfirm,
  title,
  minuteInterval,
  testID,
}: TimePickerSheetProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useUnistyles();
  const vm = useTimePickerSheet({ visible: isVisible, value, onConfirm });

  return (
    <PickerSheet
      visible={isVisible}
      title={title ?? t('timePicker.title')}
      testID={testID}
      onClose={onClose}
      onConfirm={vm.onConfirmDraft}
    >
      <DateTimePicker
        testID={testID ? `${testID}.picker` : undefined}
        mode="time"
        display="spinner"
        value={vm.date}
        minuteInterval={minuteInterval}
        locale={i18n.language}
        themeVariant={theme.name}
        textColor={theme.colors.textPrimary}
        onValueChange={(_event, date) => {
          vm.onChangeDate(date);
        }}
      />
    </PickerSheet>
  );
}
