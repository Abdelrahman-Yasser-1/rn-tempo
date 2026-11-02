import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';

import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { useLanguage } from '@services/i18n/useLanguage';
import { useDebounce } from '@shared/hooks';

import { useItemsInfiniteQuery } from '../../api/queries';
import { SEARCH_DEBOUNCE_MS } from '../../constants';

/** Logic of the items list: debounced search, paging, refresh and navigation. */
export function useItemsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemsList'>>();
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

  const onLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  };

  const onRefresh = () => {
    void refetch();
  };

  const onItemPress = (itemId: number) => {
    navigation.navigate('ItemDetails', { itemId });
  };

  const onCreate = () => {
    navigation.navigate('ItemCreate');
  };

  return {
    language,
    canCreate,
    search,
    items,
    error,
    isPending,
    isError,
    isFetchingNextPage,
    isRefreshing: isRefetching && !isFetchingNextPage && !isPlaceholderData,
    onSearchChange: setSearch,
    onLoadMore,
    onRefresh,
    onItemPress,
    onCreate,
    onBack: navigation.goBack,
  };
}
