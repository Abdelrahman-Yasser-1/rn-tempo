import { View } from 'react-native';

import { Bone } from '../Bone';
import { Skeleton } from '../Skeleton';

import { styles } from './styles';
import type { CardShimmerProps } from './types';

/** Placeholder shaped like a list-item card: a heading line and two text lines. */
export function CardShimmer({ testID }: CardShimmerProps) {
  return (
    <Skeleton testID={testID}>
      <View style={styles.card}>
        <Bone height={16} width="60%" />
        <Bone height={12} width="90%" />
        <Bone height={12} width="75%" />
      </View>
    </Skeleton>
  );
}
