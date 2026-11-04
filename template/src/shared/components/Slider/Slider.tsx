import RNSlider from '@react-native-community/slider';
import type { AccessibilityActionEvent } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Box } from '../Box';
import { FieldLabel } from '../FieldLabel';
import { FieldMessage } from '../FieldMessage';
import { Text } from '../Text';

import { styles } from './styles';
import type { SliderProps } from './types';
import { useSlider } from './useSlider';

const DEFAULT_STEP = 1;
const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

const formatPlain = (value: number) => String(value);

/**
 * Themed range slider with an optional value readout and min/max labels. The native control
 * mirrors itself in right-to-left layouts, so the minimum is always at the start edge. Screen
 * readers can step it with the adjustable increment and decrement actions.
 */
export function Slider({
  value,
  onChange,
  onChangeEnd,
  min,
  max,
  step = DEFAULT_STEP,
  showValue: isValueShown = false,
  formatValue = formatPlain,
  minLabel,
  maxLabel,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  testID,
}: SliderProps) {
  const { theme } = useUnistyles();
  const vm = useSlider({ value, onChange, onChangeEnd, min, max, step });
  const isInvalid = errorText !== undefined && errorText !== '';
  const isInert = isDisabled || isReadOnly;
  styles.useVariants({ disabled: isDisabled });

  const message = isInvalid ? errorText : helperText;
  const messageKind = isInvalid ? 'error' : 'helper';
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const hasHeader = label !== undefined || isValueShown;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      vm.onIncrement();
    } else if (event.nativeEvent.actionName === 'decrement') {
      vm.onDecrement();
    }
  };

  return (
    <Box style={styles.root}>
      {hasHeader && (
        <Box style={styles.header}>
          {label !== undefined && (
            <Box style={styles.label}>
              <FieldLabel
                testID={suffix('label')}
                label={label}
                required={isRequired}
                subLabel={subLabel}
                tooltip={tooltip}
              />
            </Box>
          )}
          {isValueShown && (
            <Text testID={suffix('value')} variant="bodyStrong" color="textPrimary">
              {formatValue(value)}
            </Text>
          )}
        </Box>
      )}
      <RNSlider
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: formatValue(value) }}
        accessibilityActions={ADJUST_ACTIONS}
        accessibilityState={{ disabled: isInert }}
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        disabled={isInert}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.border}
        thumbTintColor={theme.colors.primary}
        style={styles.slider}
        onAccessibilityAction={onAccessibilityAction}
        onValueChange={vm.onValueChange}
        onSlidingComplete={vm.onSlidingComplete}
      />
      <Box style={styles.range}>
        <Text testID={suffix('min')} variant="caption" color="textSecondary">
          {minLabel ?? formatValue(min)}
        </Text>
        <Text testID={suffix('max')} variant="caption" color="textSecondary">
          {maxLabel ?? formatValue(max)}
        </Text>
      </Box>
      {message !== undefined && message !== '' && (
        <FieldMessage testID={suffix(messageKind)} variant={messageKind} message={message} />
      )}
    </Box>
  );
}
