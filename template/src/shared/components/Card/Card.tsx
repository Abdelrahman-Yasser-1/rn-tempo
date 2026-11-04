import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { HIT_SLOP } from '@shared/constants/touch';
import { usePressFeedback } from '@shared/hooks';

import { Image } from '../Image';

import { styles } from './styles';
import type { CardProps } from './types';

const DEFAULT_MEDIA_HEIGHT = 160;

/**
 * Surface container with an optional image across the top (`media`). Becomes a pressable button
 * when `onPress` is given. Compose rows inside it with `CardSection`.
 */
export function Card({
  variant = 'elevated',
  padding = 'lg',
  media,
  children,
  onPress,
  onPressIn,
  onPressOut,
  testID,
  ...rest
}: CardProps) {
  const { animatedStyle, handlers } = usePressFeedback();
  styles.useVariants({ variant, padding });

  const body = (
    <>
      {media !== undefined && (
        <View testID={testID ? `${testID}.media` : undefined} style={styles.media}>
          <Image
            source={media.source}
            accessibilityLabel={media.accessibilityLabel}
            height={media.height ?? DEFAULT_MEDIA_HEIGHT}
            resizeMode={media.resizeMode}
          />
          {media.overlay !== undefined && (
            <View pointerEvents="box-none" style={styles.overlay}>
              {media.overlay}
            </View>
          )}
        </View>
      )}
      <View style={styles.content}>{children}</View>
    </>
  );

  if (onPress === undefined) {
    return (
      <View testID={testID} style={styles.root}>
        {body}
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
      <Animated.View style={[styles.root, animatedStyle]}>{body}</Animated.View>
    </Pressable>
  );
}
