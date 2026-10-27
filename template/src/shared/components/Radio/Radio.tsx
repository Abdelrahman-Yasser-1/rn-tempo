import { Pressable } from 'react-native';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { useRadioGroup } from '../RadioGroup';
import { Text } from '../Text';

import { styles } from './styles';
import type { RadioProps } from './types';

/** Single option of a `RadioGroup`. */
export function Radio({
  value,
  label,
  disabled: isDisabledProp = false,
  accessibilityLabel,
  accessibilityState,
  testID,
  ...rest
}: RadioProps) {
  const group = useRadioGroup();
  const isSelected = group?.value === value;
  const isDisabled = isDisabledProp || (group?.disabled ?? false);
  const state = {
    ...accessibilityState,
    selected: isSelected,
    checked: isSelected,
    disabled: isDisabled,
  };
  styles.useVariants({ selected: isSelected, disabled: isDisabled });

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isDisabled}
      style={styles.root}
      onPress={() => {
        group?.onChange(value);
      }}
    >
      <Box style={styles.outer}>{isSelected && <Box style={styles.dot} />}</Box>
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
