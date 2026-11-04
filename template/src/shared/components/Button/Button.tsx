import { ActivityIndicator, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useUnistyles } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';
import { BUTTON_CONTENT_COLOR } from '@theme/buttonVariants';
import type { ColorTokens, TypographyVariant } from '@theme/tokens';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ButtonProps, ButtonSize } from './types';
import { useButton } from './useButton';

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 20, lg: 24 };
const LABEL_VARIANT: Record<ButtonSize, TypographyVariant> = {
  sm: 'label',
  md: 'button',
  lg: 'button',
};

/** Pressable button with variants, sizes, an icon, a loading state and animated press feedback. */
export function Button({
  title,
  tx,
  txOptions,
  variant = 'primary',
  size = 'md',
  loading: isLoading = false,
  disabled: isDisabled = false,
  icon,
  iconPosition = 'start',
  fullWidth: isFullWidth = false,
  accessibilityLabel,
  accessibilityState,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: ButtonProps) {
  const { theme } = useUnistyles();
  const { animatedStyle, isPressed, ...handlers } = useButton({ onPressIn, onPressOut });
  const isInactive = isDisabled || isLoading;
  const state = { ...accessibilityState, disabled: isInactive, busy: isLoading };
  styles.useVariants({ variant, size, fullWidth: isFullWidth });

  const contentColor: keyof ColorTokens = isDisabled
    ? 'textDisabled'
    : BUTTON_CONTENT_COLOR[variant];
  const isLink = variant === 'link';
  const isIconAtEnd = iconPosition === 'end';

  // The spinner takes the icon's place, or the start slot when there is no icon.
  const isSpinnerAtStart = isLoading && !isIconAtEnd;
  const isSpinnerAtEnd = isLoading && isIconAtEnd;
  const spinner = (
    <ActivityIndicator
      testID={testID ? `${testID}.spinner` : undefined}
      color={theme.colors[contentColor]}
    />
  );
  const iconNode = icon ? <Icon name={icon} size={ICON_SIZE[size]} color={contentColor} /> : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isInactive}
      onPressIn={handlers.onPressIn}
      onPressOut={handlers.onPressOut}
      style={styles.root}
    >
      <Animated.View
        style={[
          styles.container,
          isPressed && !isInactive && styles.pressed,
          isDisabled && styles.disabled,
          animatedStyle,
        ]}
      >
        {isSpinnerAtStart ? spinner : !isIconAtEnd && iconNode}
        <Text
          testID={testID ? `${testID}.label` : undefined}
          variant={LABEL_VARIANT[size]}
          color={contentColor}
          tx={tx}
          txOptions={txOptions}
          style={isLink && isPressed ? styles.pressedLabel : undefined}
        >
          {title}
        </Text>
        {isSpinnerAtEnd ? spinner : isIconAtEnd && iconNode}
      </Animated.View>
    </Pressable>
  );
}
