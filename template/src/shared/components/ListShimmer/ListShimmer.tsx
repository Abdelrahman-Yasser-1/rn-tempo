import { View } from 'react-native';

import { CardShimmer } from '../CardShimmer';
import { Skeleton } from '../Skeleton';

import { styles } from './styles';
import type { ListShimmerProps } from './types';

/** Placeholder for a loading list: a column of `CardShimmer` rows. */
export function ListShimmer({ count = 6, testID }: ListShimmerProps) {
  return (
    <Skeleton testID={testID}>
      <View style={styles.list}>
        {Array.from({ length: count }, (_, index) => (
          <CardShimmer key={index} />
        ))}
      </View>
    </Skeleton>
  );
}
