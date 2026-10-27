import { View } from 'react-native';

import { Bone } from '../Bone';
import { Skeleton } from '../Skeleton';

import { styles } from './styles';
import type { DetailsShimmerProps } from './types';

/** Placeholder for a details screen: an image block, a title, body lines and an action. */
export function DetailsShimmer({ testID }: DetailsShimmerProps) {
  return (
    <Skeleton testID={testID}>
      <View style={styles.container}>
        <Bone height={180} radius="lg" />
        <Bone height={24} width="70%" />
        <Bone height={14} />
        <Bone height={14} />
        <Bone height={14} width="50%" />
        <Bone height={48} radius="lg" />
      </View>
    </Skeleton>
  );
}
