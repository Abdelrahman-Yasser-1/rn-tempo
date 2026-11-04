import { View } from 'react-native';

import { styles } from './styles';
import type { CardSectionProps } from './types';

/** A padded block inside a `Card` (use `padding="none"` on the card), optionally divided. */
export function CardSection({
  divider: hasDivider = false,
  padding = 'lg',
  children,
  testID,
}: CardSectionProps) {
  styles.useVariants({ padding, divider: hasDivider });

  return (
    <View testID={testID} style={styles.root}>
      {children}
    </View>
  );
}
