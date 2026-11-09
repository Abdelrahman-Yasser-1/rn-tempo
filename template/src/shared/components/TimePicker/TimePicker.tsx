import { useTranslation } from 'react-i18next';

import { PickerField } from '@shared/components/PickerField';
import { TimePickerSheet } from '@shared/components/TimePickerSheet';

import type { TimePickerProps } from './types';
import { useTimePicker } from './useTimePicker';

/**
 * Time field. On iOS it opens a bottom sheet with the native time wheel and a Confirm step; on
 * Android it opens the system time dialog, which confirms natively. Times are 24-hour `HH:mm`.
 */
export function TimePicker({
  value,
  onChange,
  formatValue,
  minuteInterval,
  placeholder,
  sheetTitle,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled,
  readOnly: isReadOnly,
  testID,
}: TimePickerProps) {
  const { t } = useTranslation();
  const vm = useTimePicker({ value, onChange, formatValue, minuteInterval });

  return (
    <>
      <PickerField
        label={label}
        required={isRequired}
        subLabel={subLabel}
        tooltip={tooltip}
        helperText={helperText}
        errorText={errorText}
        disabled={isDisabled}
        readOnly={isReadOnly}
        valueText={vm.valueText}
        placeholder={placeholder ?? t('timePicker.placeholder')}
        icon="clock"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      {vm.hasSheet && (
        <TimePickerSheet
          visible={vm.isOpen}
          value={value}
          title={sheetTitle ?? label}
          minuteInterval={minuteInterval}
          testID={testID ? `${testID}.sheet` : undefined}
          onConfirm={onChange}
          onClose={vm.onClose}
        />
      )}
    </>
  );
}
