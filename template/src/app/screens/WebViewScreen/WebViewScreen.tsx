import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '@navigation/types';
import { ErrorState, Header, Screen, WebView } from '@shared/components';
import type { HeaderAction } from '@shared/components';

import { useWebViewScreen } from './useWebViewScreen';

type WebViewScreenProps = Readonly<{ route: { params: RootStackParamList['WebView'] } }>;

/**
 * In-app browser: a header with back, reload and "open in browser", over a `WebView`. It loads
 * only `https` addresses. Open it with `navigate('WebView', { url, title? })`.
 */
export function WebViewScreen({ route }: WebViewScreenProps) {
  const { t } = useTranslation();
  const vm = useWebViewScreen(route);
  const actions: readonly HeaderAction[] = [
    {
      icon: 'refresh',
      accessibilityLabel: t(($) => $.webView.reload),
      onPress: vm.onReload,
      testID: 'web-view.reload',
    },
    {
      icon: 'external-link',
      accessibilityLabel: t(($) => $.webView.openInBrowser),
      onPress: vm.onOpenInBrowser,
      testID: 'web-view.open-in-browser',
    },
  ];

  return (
    <Screen testID="web-view-screen">
      <Header
        title={vm.title}
        onBack={vm.onBack}
        actions={vm.isSecure ? actions : undefined}
        testID="web-view.header"
      />
      {vm.isSecure ? (
        <WebView
          url={vm.url}
          reloadToken={vm.reloadToken}
          onPageChange={vm.onPageChange}
          testID="web-view.content"
        />
      ) : (
        <ErrorState
          title={t(($) => $.webView.errorTitle)}
          message={t(($) => $.webView.unsafe)}
          testID="web-view.unsafe"
        />
      )}
    </Screen>
  );
}
