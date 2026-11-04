import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { PickerField } from '../PickerField';
import { PickerSheet } from '../PickerSheet';
import { Text } from '../Text';

import { styles } from './styles';
import type { TimeSlotPickerProps } from './types';
import { useTimeSlotPicker } from './useTimeSlotPicker';

/**
 * Time slot field: a trigger that opens a bottom sheet listing the slots as chips under morning,
 * afternoon and evening. Tapping a slot selects it and closes the sheet. Values are `HH:mm`.
 */
export function TimeSlotPicker({
  slots,
  value,
  onChange,
  date,
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
}: TimeSlotPickerProps) {
  const { t } = useTranslation();
  const vm = useTimeSlotPicker({ slots, value, onChange, date, label, sheetTitle });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

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
        placeholder={placeholder ?? t('timeSlot.placeholder')}
        icon="clock"
        open={vm.isOpen}
        testID={testID}
        onPress={vm.onOpen}
      />
      <PickerSheet
        scrollable
        visible={vm.isOpen}
        title={vm.title}
        testID={suffix('sheet')}
        onClose={vm.onClose}
      >
        {vm.hasSlots ? (
          vm.groups.map((group) => (
            <Box key={group.period} style={styles.group}>
              <Text variant="label" color="textSecondary" accessibilityRole="header">
                {group.title}
              </Text>
              <Box style={styles.chips}>
                {group.slots.map((slot) => (
                  <Chip
                    key={slot.value}
                    testID={suffix(`slot.${slot.value}`)}
                    label={vm.slotText(slot)}
                    selected={slot.value === value}
                    disabled={slot.disabled}
                    onPress={() => {
                      vm.onSelect(slot.value);
                    }}
                  />
                ))}
              </Box>
            </Box>
          ))
        ) : (
          <EmptyState
            testID={suffix('empty')}
            title={t('timeSlot.empty.title')}
            message={t('timeSlot.empty.message')}
          />
        )}
      </PickerSheet>
    </>
  );
}
