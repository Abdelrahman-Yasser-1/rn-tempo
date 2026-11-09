import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { Badge } from '@shared/components/Badge';
import { Chip } from '@shared/components/Chip';
import { Icon } from '@shared/components/Icon';

import { styles } from './styles';
import type { FilterBarProps } from './types';

/**
 * Row of selectable filter chips with an optional filter button (and active-count badge) at the
 * start. The chips scroll horizontally and read right to left in Arabic.
 */
export function FilterBar({
  filters,
  selected,
  onToggle,
  onFilterPress,
  filterCount = 0,
  testID,
}: FilterBarProps) {
  const { t } = useTranslation();
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const hasCount = filterCount > 0;

  return (
    <View testID={testID} style={styles.root}>
      {onFilterPress !== undefined && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasCount
              ? t('filterBar.filtersActive', { active: filterCount })
              : t('filterBar.filters')
          }
          testID={suffix('button')}
          style={styles.button}
          onPress={onFilterPress}
        >
          <Icon name="adjustments-horizontal" color="textPrimary" />
          {hasCount && (
            <View style={styles.badge}>
              <Badge count={filterCount} size="sm" variant="primary" testID={suffix('badge')} />
            </View>
          )}
        </Pressable>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      >
        {filters.map((filter) => (
          <Chip
            key={filter.key}
            label={filter.label}
            leftIcon={filter.icon}
            selected={selected.includes(filter.key)}
            testID={suffix(`chip-${filter.key}`)}
            onPress={() => {
              onToggle(filter.key);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
