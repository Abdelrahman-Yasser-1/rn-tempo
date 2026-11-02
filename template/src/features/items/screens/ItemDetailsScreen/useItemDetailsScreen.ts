import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { HomeStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';

import { useItemQuery } from '../../api/queries';

/** Logic of the item details screen: route param, item query, retry and back navigation. */
export function useItemDetailsScreen(route: RouteProp<HomeStackParamList, 'ItemDetails'>) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemDetails'>>();
  const { language } = useLanguage();
  const { data, error, isError, refetch } = useItemQuery(route.params.itemId);

  const onRetry = () => {
    void refetch();
  };

  return { language, data, error, isError, onRetry, onBack: navigation.goBack };
}
