import { Pressable } from 'react-native';

import { openUrlSafe } from '@services/linking/linking';
import { HIT_SLOP } from '@shared/constants/touch';

import { Text } from '../Text';

import { styles } from './styles';
import type { LinkProps } from './types';

/**
 * Text link that runs `onPress` and/or opens `href`. By default a standalone button-sized link;
 * with `inline` it is nested text that flows inside a sentence.
 */
export function Link({
  children,
  onPress,
  href,
  variant = 'underline',
  color = 'primary',
  inline: isInline = false,
  disabled: isDisabled = false,
  accessibilityLabel,
  testID,
}: LinkProps) {
  styles.useVariants({ variant });
  const state = { disabled: isDisabled };
  const handlePress = () => {
    onPress?.();
    if (href !== undefined && href !== '') {
      void openUrlSafe(href);
    }
  };

  if (isInline) {
    return (
      <Text
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={state}
        testID={testID}
        color={isDisabled ? 'textDisabled' : color}
        style={styles.text}
        onPress={isDisabled ? undefined : handlePress}
      >
        {children}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={state}
      hitSlop={HIT_SLOP}
      disabled={isDisabled}
      testID={testID}
      style={styles.root}
      onPress={handlePress}
    >
      <Text color={isDisabled ? 'textDisabled' : color} style={styles.text}>
        {children}
      </Text>
    </Pressable>
  );
}
