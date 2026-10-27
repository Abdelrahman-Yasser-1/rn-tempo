import { Pressable } from 'react-native';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { Text } from '../Text';

import { styles } from './styles';
import type { SwitchProps } from './types';

/** Labelled on/off toggle with the label at the start and the track at the end. */
export function Switch({
  value: isOn,
  onValueChange,
  label,
  disabled: isDisabled = false,
  accessibilityLabel,
  accessibilityState,
  testID,
  ...rest
}: SwitchProps) {
  const state = { ...accessibilityState, checked: isOn, disabled: isDisabled };
  styles.useVariants({ value: isOn, disabled: isDisabled });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isDisabled}
      style={styles.root}
      onPress={() => {
        onValueChange(!isOn);
      }}
    >
      {label !== undefined && (
        <Text
          testID={testID ? `${testID}.label` : undefined}
          color={isDisabled ? 'textDisabled' : 'textPrimary'}
        >
          {label}
        </Text>
      )}
      <Box style={styles.track}>
        <Box style={styles.thumb} />
      </Box>
    </Pressable>
  );
}
