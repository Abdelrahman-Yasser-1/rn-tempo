import { Pressable } from 'react-native';

import { HIT_SLOP } from '@shared/constants/touch';

import { Box } from '../Box';
import { Text } from '../Text';

import { styles } from './styles';
import type { SwitchProps } from './types';

/** On/off toggle; the whole row is pressable. The label sits at the start by default, or the end. */
export function Switch({
  value: isOn,
  onValueChange,
  label,
  labelPosition = 'start',
  disabled: isDisabled = false,
  accessibilityLabel,
  accessibilityState,
  testID,
  ...rest
}: SwitchProps) {
  const state = { ...accessibilityState, checked: isOn, disabled: isDisabled };
  styles.useVariants({ value: isOn, disabled: isDisabled, labelPosition });
  const isLabelAtEnd = labelPosition === 'end';

  const labelNode = (
    <Text
      testID={testID ? `${testID}.label` : undefined}
      style={styles.label}
      color={isDisabled ? 'textDisabled' : 'textPrimary'}
    >
      {label}
    </Text>
  );

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
      {label !== undefined && !isLabelAtEnd && labelNode}
      <Box style={styles.track}>
        <Box style={styles.thumb} />
      </Box>
      {label !== undefined && isLabelAtEnd && labelNode}
    </Pressable>
  );
}
