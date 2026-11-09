import { useTranslation } from 'react-i18next';

import { DatePickerSheet } from '@shared/components/DatePickerSheet';
import { PickerField } from '@shared/components/PickerField';

import type { DatePickerProps } from './types';
import { useDatePicker } from './useDatePicker';

/**
 * Date field: a trigger showing the formatted day that opens a bottom sheet with a calendar.
 * The sheet confirms before `onChange` fires. Days are `YYYY-MM-DD` strings (local dates).
 */
export function DatePicker({
  value,
  onChange,
  formatValue,
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
  ...calendarProps
}: DatePickerProps) {
  const { t } = useTranslation();
  const vm = useDatePicker({ value, onChange, formatValue });

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
        placeholder={placeholder ?? t(($) => $.datePicker.placeholder)}
        icon="calendar"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      <DatePickerSheet
        {...calendarProps}
        visible={vm.isOpen}
        value={value}
        title={sheetTitle ?? label}
        testID={testID ? `${testID}.sheet` : undefined}
        onConfirm={vm.onConfirm}
        onClose={vm.onClose}
      />
    </>
  );
}
