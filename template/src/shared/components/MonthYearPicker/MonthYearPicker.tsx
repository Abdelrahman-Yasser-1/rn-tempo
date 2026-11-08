import { useTranslation } from 'react-i18next';

import { MonthYearGrid } from '@shared/components/MonthYearGrid';
import { PickerField } from '@shared/components/PickerField';
import { PickerSheet } from '@shared/components/PickerSheet';

import type { MonthYearPickerProps } from './types';
import { useMonthYearPicker } from './useMonthYearPicker';

/**
 * Month and year field: a trigger showing "November 2026" that opens a bottom sheet with a month
 * grid and a year list. The sheet confirms before `onChange` fires. Values are `YYYY-MM` strings.
 */
export function MonthYearPicker({
  value,
  onChange,
  minMonth,
  maxMonth,
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
}: MonthYearPickerProps) {
  const { t } = useTranslation();
  const vm = useMonthYearPicker({ value, onChange, formatValue });

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
        placeholder={placeholder ?? t('monthYearPicker.placeholder')}
        icon="calendar"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      <PickerSheet
        visible={vm.isOpen}
        title={sheetTitle ?? label ?? t('monthYearPicker.title')}
        testID={testID ? `${testID}.sheet` : undefined}
        confirmDisabled={!vm.hasDraft}
        onClose={vm.onClose}
        onConfirm={vm.onConfirm}
      >
        <MonthYearGrid
          key={vm.session}
          testID={testID ? `${testID}.grid` : undefined}
          year={vm.gridYear}
          month={vm.gridMonth}
          minMonth={minMonth}
          maxMonth={maxMonth}
          onSelect={vm.onSelect}
        />
      </PickerSheet>
    </>
  );
}
