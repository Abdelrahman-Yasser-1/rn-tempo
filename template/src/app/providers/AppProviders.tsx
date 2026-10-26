import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { queryClient } from '@services/http/queryClient';
import { i18n } from '@services/i18n/i18n';

import { ErrorBoundary } from './ErrorBoundary';
import { styles } from './styles';

type Props = { children: ReactNode };

/**
 * Provider order, outermost first (task 3.12): gesture root, safe area, query client, i18n, error
 * boundary, bottom sheets, the app content (which owns the NavigationContainer), then the toast host.
 */
export function AppProviders({ children }: Readonly<Props>) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ErrorBoundary>
              <BottomSheetModalProvider>
                {children}
                <Toast />
              </BottomSheetModalProvider>
            </ErrorBoundary>
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
