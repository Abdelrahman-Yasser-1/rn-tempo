import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { useItemsInfiniteQuery } from '@features/items/api/queries';
import { SEARCH_DEBOUNCE_MS } from '@features/items/constants';
import type { HomeStackParamList } from '@navigation/types';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { useLanguage } from '@services/i18n/useLanguage';
import { useDebounce } from '@shared/hooks';

/** Logic of the items list: debounced search, the paged query and navigation. */
export function useItemsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemsList'>>();
  const { language } = useLanguage();
  const canCreate = useFeatureFlag('itemsCreateEnabled');
  const [search, setSearch] = useState('');
  const query = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const itemsQuery = useItemsInfiniteQuery(query);

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
    itemsQuery,
    onSearchChange: setSearch,
    onItemPress,
    onCreate,
    onBack: navigation.goBack,
  };
}
