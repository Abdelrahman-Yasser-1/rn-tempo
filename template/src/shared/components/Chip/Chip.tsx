import { Pressable } from 'react-native';

import { CHIP_HIT_SLOP } from '@shared/constants/touch';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ChipProps } from './types';

/** Compact pill for filters and tags; pass `onPress` to make it selectable. */
export function Chip({
  label,
  selected: isSelected = false,
  disabled: isDisabled = false,
  leftIcon,
  accessibilityLabel,
  accessibilityState,
  testID,
  ...rest
}: ChipProps) {
  const state = { ...accessibilityState, selected: isSelected, disabled: isDisabled };
  styles.useVariants({ selected: isSelected, disabled: isDisabled });
  const contentColor = isSelected ? 'onPrimaryContainer' : 'onSurfaceVariant';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={state}
      hitSlop={CHIP_HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isDisabled}
      style={styles.root}
    >
      {leftIcon && <Icon name={leftIcon} size={16} color={contentColor} />}
      <Text testID={testID ? `${testID}.label` : undefined} variant="label" color={contentColor}>
        {label}
      </Text>
    </Pressable>
  );
}
