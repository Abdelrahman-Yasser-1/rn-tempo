import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// @tempo-feature:webview:start
import { navigationRef } from '@navigation/navigationRef';
// @tempo-feature:webview:end
import type { HomeStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';

import { useItemQuery } from '../../api/queries';
// @tempo-feature:webview:start
import { PRODUCT_PAGE_URL } from '../../constants';
// @tempo-feature:webview:end

/** Logic of the item details screen: route param, item query, retry and back navigation. */
export function useItemDetailsScreen(route: RouteProp<HomeStackParamList, 'ItemDetails'>) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemDetails'>>();
  const { language } = useLanguage();
  const { data, error, isError, refetch } = useItemQuery(route.params.itemId);

  const onRetry = () => {
    void refetch();
  };

  // @tempo-feature:webview:start
  const onOpenProductPage = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('WebView', {
        url: `${PRODUCT_PAGE_URL}/${String(route.params.itemId)}`,
        title: data?.title,
      });
    }
  };
  // @tempo-feature:webview:end

  return {
    language,
    data,
    error,
    isError,
    onRetry,
    // @tempo-feature:webview:start
    onOpenProductPage,
    // @tempo-feature:webview:end
    onBack: navigation.goBack,
  };
}
