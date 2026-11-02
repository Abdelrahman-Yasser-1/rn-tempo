import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { useLanguage } from '@services/i18n/useLanguage';
import {
  EmptyState,
  ErrorState,
  Header,
  IconButton,
  Image,
  ListItem,
  ListShimmer,
  Loader,
  Screen,
  TextField,
} from '@shared/components';
import { useDebounce } from '@shared/hooks';
import { formatCurrency } from '@shared/utils';

import { useItemsInfiniteQuery } from '../../api/queries';
import { SEARCH_DEBOUNCE_MS } from '../../constants';
import type { Item } from '../../types';

import { styles } from './styles';

type ItemsListScreenProps = Readonly<NativeStackScreenProps<HomeStackParamList, 'ItemsList'>>;

const THUMBNAIL_SIZE = 48;

export function ItemsListScreen({ navigation }: ItemsListScreenProps) {
  const { t } = useTranslation('items');
  const { language } = useLanguage();
  const canCreate = useFeatureFlag('itemsCreateEnabled');
  const [search, setSearch] = useState('');
  const query = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const {
    data,
    error,
    isPending,
    isError,
    isRefetching,
    isPlaceholderData,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useItemsInfiniteQuery(query);
  const items = useMemo(() => data?.pages.flatMap((page) => page.products) ?? [], [data]);

  const renderItem = ({ item, index }: Readonly<{ item: Item; index: number }>) => (
    <ListItem
      title={item.title}
      subtitle={formatCurrency(item.price, 'USD', language)}
      left={
        <Image
          source={{ uri: item.thumbnail }}
          width={THUMBNAIL_SIZE}
          height={THUMBNAIL_SIZE}
          radius="md"
        />
      }
      showChevron
      showDivider
      accessibilityLabel={item.title}
      onPress={() => {
        navigation.navigate('ItemDetails', { itemId: item.id });
      }}
      testID={`items-list.item-${String(index)}`}
    />
  );

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  const refresh = () => {
    void refetch();
  };

  let body;
  if (isPending) {
    body = <ListShimmer testID="items-list.loading" />;
  } else if (isError) {
    body = <ErrorState error={error} onRetry={refresh} testID="items-list.error" />;
  } else {
    body = (
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={isRefetching && !isFetchingNextPage && !isPlaceholderData}
        onRefresh={refresh}
        ListEmptyComponent={
          <EmptyState
            title={t('list.emptyTitle')}
            message={t('list.emptyMessage')}
            testID="items-list.empty"
          />
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <Loader testID="items-list.loading-more" />
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <Screen preset="fixed" testID="items-list-screen">
      <Header
        title={t('list.title')}
        onBack={navigation.goBack}
        right={
          canCreate ? (
            <IconButton
              icon="plus"
              variant="ghost"
              accessibilityLabel={t('list.create')}
              onPress={() => {
                navigation.navigate('ItemCreate');
              }}
              testID="items-list.create-button"
            />
          ) : undefined
        }
        testID="items-list.header"
      />
      <View style={styles.search}>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder={t('list.searchPlaceholder')}
          accessibilityLabel={t('list.searchLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="items-list.search-input"
        />
      </View>
      <View style={styles.body}>{body}</View>
    </Screen>
  );
}
