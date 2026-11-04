import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import type { RootStackParamList } from '@navigation/types';
import { openUrlSafe } from '@services/linking/linking';
import { isHttpsUrl, parseUrl, type WebViewPageState } from '@shared/components';

/**
 * Logic of the web view screen: the header title (given, else the page's own, else the host),
 * reloading, opening the current page in the system browser, and the `https`-only check.
 */
export function useWebViewScreen(route: { params: RootStackParamList['WebView'] }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'WebView'>>();
  const { url, title } = route.params;
  const [page, setPage] = useState<WebViewPageState>();
  const [reloadToken, setReloadToken] = useState(0);
  const currentUrl = page?.url ?? url;
  const pageTitle = page?.title ?? '';

  return {
    url,
    isSecure: isHttpsUrl(url),
    title: title ?? (pageTitle === '' ? (parseUrl(url)?.host ?? '') : pageTitle),
    reloadToken,
    onPageChange: setPage,
    onReload: () => {
      setReloadToken((token) => token + 1);
    },
    onOpenInBrowser: () => {
      // The view only loads https pages, but the address is the page's to report: check it again.
      if (isHttpsUrl(currentUrl)) {
        void openUrlSafe(currentUrl);
      }
    },
    onBack: navigation.goBack,
  };
}
