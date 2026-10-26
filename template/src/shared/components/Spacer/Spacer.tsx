import { View } from 'react-native';

import { styles } from './styles';
import type { SpacerProps } from './types';

/** Empty space sized by a spacing token. */
export function Spacer({ size = 'md', horizontal: isHorizontal = false, testID }: SpacerProps) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.spacer(size, isHorizontal)}
    />
  );
}
