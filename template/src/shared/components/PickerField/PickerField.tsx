import { Pressable } from 'react-native';

import { Box } from '@shared/components/Box';
import { FieldLabel } from '@shared/components/FieldLabel';
import { FieldMessage } from '@shared/components/FieldMessage';
import { Icon } from '@shared/components/Icon';
import { Text } from '@shared/components/Text';
import { HIT_SLOP } from '@shared/constants/touch';

import { styles } from './styles';
import type { PickerFieldProps } from './types';

/**
 * Field shell shared by the date, time, month and time slot pickers: label, a trigger that shows
 * the formatted value (or a placeholder) with an icon, and the helper / error message. The trigger
 * is a pressable that holds its own content, with nothing laid over it.
 */
export function PickerField({
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  valueText,
  placeholder,
  icon,
  open: isOpen = false,
  onPress,
  testID,
}: PickerFieldProps) {
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({
    open: isOpen,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <FieldLabel
          testID={suffix('label')}
          label={label}
          required={isRequired}
          subLabel={subLabel}
          tooltip={tooltip}
        />
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityState={{ expanded: isOpen, disabled: isDisabled }}
        hitSlop={HIT_SLOP}
        testID={testID}
        disabled={isDisabled}
        style={styles.trigger}
        onPress={isReadOnly ? undefined : onPress}
      >
        <Text
          testID={suffix('value')}
          style={styles.value}
          numberOfLines={1}
          color={valueText === undefined ? 'textSecondary' : 'textPrimary'}
        >
          {valueText ?? placeholder}
        </Text>
        {!isReadOnly && <Icon name={icon} size="md" color="textSecondary" />}
      </Pressable>
      {message !== undefined && message !== '' && (
        <FieldMessage testID={suffix(messageKind)} variant={messageKind} message={message} />
      )}
    </Box>
  );
}
