import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { paginationRange } from '@shared/utils';

import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { PaginationProps } from './types';

type PageButtonProps = Readonly<{
  page: number;
  isSelected: boolean;
  testID?: string;
  onPress: () => void;
}>;

function PageButton({ page, isSelected, testID, onPress }: PageButtonProps) {
  const { t } = useTranslation();
  styles.useVariants({ selected: isSelected });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('pagination.page', { page })}
      accessibilityState={{ selected: isSelected }}
      testID={testID}
      style={styles.cell}
      onPress={onPress}
    >
      <Text variant="label" color={isSelected ? 'onPrimary' : 'textPrimary'}>
        {String(page)}
      </Text>
    </Pressable>
  );
}

/**
 * Page picker with previous/next arrows (they mirror in Arabic) and ellipses over skipped pages.
 * `page` is 1-based.
 */
export function Pagination({ page, pageCount, onChange, siblings = 1, testID }: PaginationProps) {
  const { t } = useTranslation();
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const items = paginationRange(page, pageCount, siblings);

  return (
    <View testID={testID} style={styles.root}>
      <IconButton
        icon="chevron-left"
        variant="ghost"
        accessibilityLabel={t('pagination.previous')}
        disabled={page <= 1}
        testID={suffix('previous')}
        onPress={() => {
          onChange(page - 1);
        }}
      />
      {items.map((item) =>
        typeof item === 'number' ? (
          <PageButton
            key={item}
            page={item}
            isSelected={item === page}
            testID={suffix(`page-${String(item)}`)}
            onPress={() => {
              onChange(item);
            }}
          />
        ) : (
          <View key={item} style={styles.cell} importantForAccessibility="no-hide-descendants">
            <Text color="textSecondary">…</Text>
          </View>
        ),
      )}
      <IconButton
        icon="chevron-right"
        variant="ghost"
        accessibilityLabel={t('pagination.next')}
        disabled={page >= pageCount}
        testID={suffix('next')}
        onPress={() => {
          onChange(page + 1);
        }}
      />
    </View>
  );
}
