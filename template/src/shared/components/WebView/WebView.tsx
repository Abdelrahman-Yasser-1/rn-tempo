import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import NativeWebView from 'react-native-webview';

import { ErrorState } from '@shared/components/ErrorState';

import { styles } from './styles';
import type { WebViewProps } from './types';
import { useWebView } from './useWebView';

/**
 * Themed web view: a thin progress bar while a page loads, an error state with Retry when it
 * fails, and a navigation policy that keeps the user on the allowed hosts: links elsewhere open in
 * the system browser, and only `https` pages load inside the view.
 */
export function WebView({ url, allowedHosts, reloadToken, onPageChange, testID }: WebViewProps) {
  const { t } = useTranslation();
  const webViewRef = useRef<NativeWebView<object>>(null);
  const vm = useWebView({ url, allowedHosts, reloadToken, onPageChange, webViewRef });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.track}>
        {vm.isLoading && (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t(($) => $.webView.loading)}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(vm.progress * 100) }}
            style={styles.fill(vm.progress)}
            testID={suffix('progress')}
          />
        )}
      </View>
      <NativeWebView<object>
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webView}
        testID={suffix('view')}
        // Every request goes through `onShouldStartLoadWithRequest`, which holds the policy; the
        // library's own whitelist would open other schemes without asking.
        originWhitelist={['*']}
        // Android: load `target="_blank"` links in this view instead of dropping them.
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        onLoadProgress={vm.onLoadProgress}
        onError={vm.onError}
        onHttpError={vm.onHttpError}
        onNavigationStateChange={vm.onNavigationStateChange}
        onShouldStartLoadWithRequest={vm.onShouldStartLoadWithRequest}
      />
      {vm.hasError && (
        <View style={styles.error}>
          <ErrorState
            title={t(($) => $.webView.errorTitle)}
            message={t(($) => $.webView.errorMessage)}
            onRetry={vm.onRetry}
            testID={suffix('error')}
          />
        </View>
      )}
    </View>
  );
}
