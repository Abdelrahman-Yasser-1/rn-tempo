import { View } from 'react-native';

import { Text } from '../Text';

import { styles } from './styles';
import type { StatusIndicatorProps } from './types';

/** Coloured dot followed by a label, e.g. "Active". The label carries the meaning, not the colour. */
export function StatusIndicator({ status, label, size = 'md', testID }: StatusIndicatorProps) {
  styles.useVariants({ status, size });

  return (
    <View accessible accessibilityLabel={label} testID={testID} style={styles.root}>
      <View
        testID={testID ? `${testID}.dot` : undefined}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.dot}
      />
      <Text variant={size === 'sm' ? 'caption' : 'bodySmall'} importantForAccessibility="no">
        {label}
      </Text>
    </View>
  );
}
