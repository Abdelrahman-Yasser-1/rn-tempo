import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@services/http/queryClient';
import { i18n } from '@services/i18n/i18n';
import { ErrorBoundary, ToastHost } from '@shared/components';

import { styles } from './styles';

type Props = { children: ReactNode };

/**
 * Provider order, outermost first (task 3.12): gesture root, safe area, keyboard, query client, i18n, error
 * boundary, bottom sheets, the app content (which owns the NavigationContainer), then the toast host.
 */
export function AppProviders({ children }: Readonly<Props>) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <ErrorBoundary>
                <BottomSheetModalProvider>
                  {children}
                  <ToastHost />
                </BottomSheetModalProvider>
              </ErrorBoundary>
            </I18nextProvider>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
