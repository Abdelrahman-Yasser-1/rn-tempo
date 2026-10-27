import { View } from 'react-native';

import { Bone } from '../Bone';
import { CardShimmer } from '../CardShimmer';
import { Screen } from '../Screen';
import { Skeleton } from '../Skeleton';

import { styles } from './styles';
import type { ScreenShimmerProps } from './types';

/** Whole-screen placeholder for screens that fit neither `ListShimmer` nor `DetailsShimmer`. */
export function ScreenShimmer({ cardCount = 3, testID }: ScreenShimmerProps) {
  return (
    <Screen testID={testID}>
      <Skeleton>
        <View style={styles.content}>
          <Bone height={24} width="50%" />
          {Array.from({ length: cardCount }, (_, index) => (
            <CardShimmer key={index} />
          ))}
        </View>
      </Skeleton>
    </Screen>
  );
}
