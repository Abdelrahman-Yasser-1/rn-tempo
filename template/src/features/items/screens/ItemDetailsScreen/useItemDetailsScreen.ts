import { useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// @tempo-feature:webview:start
import { useItemQuery } from '@features/items/api/queries';
import { PRODUCT_PAGE_URL } from '@features/items/constants';
import { navigationRef } from '@navigation/navigationRef';
// @tempo-feature:webview:end
import type { HomeStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';
import { useFocusNotifyOnChangeProps } from '@shared/hooks';

// @tempo-feature:webview:start
// @tempo-feature:webview:end

/** Logic of the item details screen: route param, item query, retry and back navigation. */
export function useItemDetailsScreen(route: RouteProp<HomeStackParamList, 'ItemDetails'>) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'ItemDetails'>>();
  const { language } = useLanguage();
  const notifyOnChangeProps = useFocusNotifyOnChangeProps();
  const { data, error, isError, refetch } = useItemQuery(route.params.itemId, {
    notifyOnChangeProps,
  });

  const onRetry = () => {
    void refetch();
  };

  // @tempo-feature:webview:start
  const onOpenProductPage = () => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('WebView', {
        url: PRODUCT_PAGE_URL,
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
