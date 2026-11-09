import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { styles } from './styles';
import type { ListLoadingMoreProps } from './types';

/**
 * Footer of a paged list while the next page loads: a small spinner announced as a busy progress
 * bar named "Loading more". `PaginatedList` renders it; use it as `ListFooterComponent` elsewhere.
 */
export function ListLoadingMore({ label, testID }: ListLoadingMoreProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t(($) => $.listLoadingMore.label)}
      accessibilityState={{ busy: true }}
      testID={testID}
      style={styles.root}
    >
      <ActivityIndicator size="small" color={theme.colors.primary} />
    </View>
  );
}
