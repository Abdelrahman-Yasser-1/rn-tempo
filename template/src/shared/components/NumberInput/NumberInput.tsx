import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Box } from '@shared/components/Box';
import { FieldLabel } from '@shared/components/FieldLabel';
import { FieldMessage } from '@shared/components/FieldMessage';
import { IconButton } from '@shared/components/IconButton';

import { styles } from './styles';
import type { NumberInputProps } from './types';
import { useNumberInput } from './useNumberInput';

const DEFAULT_MIN = 0;
const DEFAULT_MAX = Number.MAX_SAFE_INTEGER;
const DEFAULT_STEP = 1;
const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

/**
 * Whole-number input: a centred text field between − and + buttons. The field takes digits only
 * and clamps to `min`/`max` when editing ends; the buttons disable at the bounds. Exposed to
 * assistive tech as an adjustable control (swipe up/down to step).
 */
export function NumberInput({
  value,
  onChange,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  step = DEFAULT_STEP,
  formatValue,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  testID,
}: NumberInputProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const vm = useNumberInput({ value, onChange, formatValue, min, max, step });
  const isInvalid = errorText !== undefined && errorText !== '';
  const isInert = isDisabled || isReadOnly;
  styles.useVariants({
    focused: vm.isFocused && !isReadOnly,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      vm.onIncrement();
    } else if (event.nativeEvent.actionName === 'decrement') {
      vm.onDecrement();
    }
  };

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
      <Box style={styles.control}>
        <IconButton
          testID={suffix('decrement')}
          icon="minus"
          variant="outline"
          disabled={isInert || !vm.canDecrement}
          accessibilityLabel={t(($) => $.numberInput.decrease)}
          onPress={vm.onDecrement}
        />
        <TextInput
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{
            min,
            max: max === DEFAULT_MAX ? undefined : max,
            now: value,
            text: vm.text,
          }}
          accessibilityActions={ADJUST_ACTIONS}
          accessibilityState={{ disabled: isDisabled }}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={1.5}
          keyboardType="number-pad"
          inputMode="numeric"
          testID={testID}
          editable={!isInert}
          readOnly={isReadOnly || undefined}
          selectTextOnFocus
          value={vm.text}
          style={styles.input}
          onAccessibilityAction={onAccessibilityAction}
          onChangeText={vm.onChangeText}
          onFocus={vm.onFocus}
          onBlur={vm.onEndEditing}
          onSubmitEditing={vm.onEndEditing}
        />
        <IconButton
          testID={suffix('increment')}
          icon="plus"
          variant="outline"
          disabled={isInert || !vm.canIncrement}
          accessibilityLabel={t(($) => $.numberInput.increase)}
          onPress={vm.onIncrement}
        />
      </Box>
      {message !== undefined && message !== '' && (
        <FieldMessage testID={suffix(messageKind)} variant={messageKind} message={message} />
      )}
    </Box>
  );
}
