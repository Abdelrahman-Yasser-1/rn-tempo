import { View } from 'react-native';

import { styles } from './styles';
import type { DividerProps } from './types';

/** Hairline separator, horizontal by default. Purely visual, so hidden from screen readers. */
export function Divider({
  orientation = 'horizontal',
  color = 'divider',
  spacing = 'none',
  testID,
}: DividerProps) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.divider(orientation, color, spacing)}
    />
  );
}
