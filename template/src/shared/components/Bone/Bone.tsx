import { View } from 'react-native';
import { Shimmer } from 'react-native-fast-shimmer';
import { useUnistyles } from 'react-native-unistyles';

import { useReducedMotion } from '@shared/hooks';

import { styles } from './styles';
import type { BoneProps } from './types';

const DEFAULT_HEIGHT = 14;
const EDGE = 'transparent';

/**
 * Placeholder block with a moving highlight. Put it inside a `Skeleton` (which owns the shared
 * animation clock); without one, or with reduced motion on, it stays a static block.
 */
export function Bone({
  width = '100%',
  height = DEFAULT_HEIGHT,
  radius = 'md',
  testID,
}: BoneProps) {
  const { theme } = useUnistyles();
  const isReducedMotion = useReducedMotion();
  const gradient = [EDGE, theme.colors.skeletonHighlight, EDGE];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={styles.bone(width, height, radius)}
    >
      {!isReducedMotion && <Shimmer linearGradients={gradient} />}
    </View>
  );
}
