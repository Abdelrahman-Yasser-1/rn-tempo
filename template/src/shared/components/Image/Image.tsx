import FastImage, { type ImageStyle } from '@d11/react-native-fast-image';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon } from '../Icon';

import { styles } from './styles';
import type { ImageProps } from './types';

// fast-image's ImageStyle extends RN's FlexStyle, which RN 0.88 no longer exports, so its type
// rejects sizing keys at compile time. They are valid at runtime, hence the cast on the fill style.
/**
 * Cached image (fast-image). The surface-colored container is the placeholder while loading, and
 * a fallback icon replaces the image if loading fails.
 */
export function Image({
  source,
  accessibilityLabel,
  width,
  height,
  radius,
  resizeMode = 'cover',
  fallback,
  style,
  testID,
}: ImageProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const isLabelled = accessibilityLabel !== undefined;

  return (
    <View
      testID={testID}
      accessible={isLabelled}
      accessibilityRole={isLabelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!isLabelled}
      importantForAccessibility={isLabelled ? 'yes' : 'no-hide-descendants'}
      style={styles.container({ width, height, radius })}
    >
      {hasFailed ? (
        <View testID={testID ? `${testID}.fallback` : undefined} style={styles.fallback}>
          {fallback ?? <Icon name="alert-circle" color="textSecondary" />}
        </View>
      ) : (
        <FastImage
          testID={testID ? `${testID}.image` : undefined}
          source={source}
          resizeMode={resizeMode}
          style={[styles.image as unknown as ImageStyle, style]}
          onError={() => {
            setHasFailed(true);
          }}
        />
      )}
    </View>
  );
}
