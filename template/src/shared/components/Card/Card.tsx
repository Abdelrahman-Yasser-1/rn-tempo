import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';

import { styles } from './styles';
import type { CardProps } from './types';

/** Surface container; becomes a pressable button when `onPress` is given. */
export function Card({
  variant = 'elevated',
  padding = 'lg',
  children,
  onPress,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: CardProps) {
  const { animatedStyle, handlers } = usePressFeedback();
  styles.useVariants({ variant, padding });

  if (onPress === undefined) {
    return (
      <View testID={testID} style={styles.root}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={HIT_SLOP}
      {...rest}
      testID={testID}
      onPress={onPress}
      onPressIn={(event) => {
        handlers.onPressIn();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        handlers.onPressOut();
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[styles.root, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
