import { View } from 'react-native';

import type { ColorTokens } from '@theme/tokens';

import { Text } from '../Text';

import { styles } from './styles';
import type { BadgeProps, BadgeVariant } from './types';

const CONTENT_COLOR: Record<BadgeVariant, keyof ColorTokens> = {
  neutral: 'onSurfaceVariant',
  primary: 'onPrimary',
  success: 'onSuccess',
  warning: 'onWarning',
  error: 'onError',
  info: 'onInfo',
};

/** Small status pill or counter. */
export function Badge({
  label,
  count,
  max = 99,
  variant = 'neutral',
  size = 'md',
  accessibilityLabel,
  testID,
}: BadgeProps) {
  styles.useVariants({ variant, size });
  let content = label;
  if (count !== undefined) {
    content = count > max ? `${String(max)}+` : String(count);
  }

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? content}
      testID={testID}
      style={styles.root}
    >
      <Text
        testID={testID ? `${testID}.label` : undefined}
        variant="caption"
        color={CONTENT_COLOR[variant]}
        importantForAccessibility="no"
      >
        {content}
      </Text>
    </View>
  );
}
