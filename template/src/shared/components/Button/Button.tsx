import { ActivityIndicator, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useUnistyles } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';
import type { ColorTokens } from '@theme/tokens';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { ButtonProps, ButtonSize, ButtonVariant } from './types';

const CONTENT_COLOR: Record<ButtonVariant, keyof ColorTokens> = {
  primary: 'onPrimary',
  secondary: 'onSecondary',
  outline: 'primary',
  ghost: 'primary',
  danger: 'onError',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 20, lg: 24 };

/** Pressable button with variants, sizes, icons, a loading state and animated press feedback. */
export function Button({
  title,
  tx,
  txOptions,
  variant = 'primary',
  size = 'md',
  loading: isLoading = false,
  disabled: isDisabled = false,
  leftIcon,
  rightIcon,
  fullWidth: isFullWidth = false,
  accessibilityLabel,
  accessibilityState,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: ButtonProps) {
  const { theme } = useUnistyles();
  const { animatedStyle, handlers } = usePressFeedback();
  const isInactive = isDisabled || isLoading;
  const state = { ...accessibilityState, disabled: isInactive, busy: isLoading };
  styles.useVariants({ variant, size, fullWidth: isFullWidth, disabled: isDisabled });

  const contentColor: keyof ColorTokens = isDisabled ? 'textDisabled' : CONTENT_COLOR[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      disabled={isInactive}
      onPressIn={(event) => {
        handlers.onPressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        handlers.onPressOut();
        onPressOut?.(event);
      }}
      style={styles.root}
    >
      <Animated.View style={[styles.container, animatedStyle]}>
        {isLoading ? (
          <ActivityIndicator
            testID={testID ? `${testID}.spinner` : undefined}
            color={theme.colors[contentColor]}
          />
        ) : (
          leftIcon && <Icon name={leftIcon} size={ICON_SIZE[size]} color={contentColor} />
        )}
        <Text
          testID={testID ? `${testID}.label` : undefined}
          variant="button"
          color={contentColor}
          tx={tx}
          txOptions={txOptions}
        >
          {title}
        </Text>
        {rightIcon && !isLoading && (
          <Icon name={rightIcon} size={ICON_SIZE[size]} color={contentColor} />
        )}
      </Animated.View>
    </Pressable>
  );
}
