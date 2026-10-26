import { ActivityIndicator, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useUnistyles } from 'react-native-unistyles';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';
import type { ColorTokens } from '@theme/tokens';

import type { ButtonSize, ButtonVariant } from '../Button';
import { Icon } from '../Icon';

import { styles } from './styles';
import type { IconButtonProps } from './types';

const CONTENT_COLOR: Record<ButtonVariant, keyof ColorTokens> = {
  primary: 'onPrimary',
  secondary: 'onSecondary',
  outline: 'primary',
  ghost: 'primary',
  danger: 'onError',
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 20, lg: 24 };

/** Round icon-only button. `accessibilityLabel` is mandatory since there is no visible text. */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  loading: isLoading = false,
  disabled: isDisabled = false,
  accessibilityState,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: IconButtonProps) {
  const { theme } = useUnistyles();
  const { animatedStyle, handlers } = usePressFeedback();
  const isInactive = isDisabled || isLoading;
  const state = { ...accessibilityState, disabled: isInactive, busy: isLoading };
  styles.useVariants({ variant, size, disabled: isDisabled });

  const contentColor: keyof ColorTokens = isDisabled ? 'textDisabled' : CONTENT_COLOR[variant];

  return (
    <Pressable
      accessibilityRole="button"
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
    >
      <Animated.View style={[styles.container, animatedStyle]}>
        {isLoading ? (
          <ActivityIndicator color={theme.colors[contentColor]} />
        ) : (
          <Icon name={icon} size={ICON_SIZE[size]} color={contentColor} />
        )}
      </Animated.View>
    </Pressable>
  );
}
