import { Pressable } from 'react-native';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { CheckboxProps } from './types';

/** Labelled checkbox; the whole row is the touch target. */
export function Checkbox({
  checked: isChecked,
  onChange,
  label,
  disabled: isDisabled = false,
  accessibilityLabel,
  accessibilityState,
  testID,
  ...rest
}: CheckboxProps) {
  const state = { ...accessibilityState, checked: isChecked, disabled: isDisabled };
  styles.useVariants({ checked: isChecked, disabled: isDisabled });

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isDisabled}
      style={styles.root}
      onPress={() => {
        onChange(!isChecked);
      }}
    >
      <Box style={styles.box}>{isChecked && <Icon name="check" size={16} color="onPrimary" />}</Box>
      {label !== undefined && (
        <Text
          testID={testID ? `${testID}.label` : undefined}
          color={isDisabled ? 'textDisabled' : 'textPrimary'}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
