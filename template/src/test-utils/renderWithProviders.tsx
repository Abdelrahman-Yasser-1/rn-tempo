import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { UnistylesRuntime } from 'react-native-unistyles';

import { i18n, initI18nInstance } from '@services/i18n/i18n';
import type { Language } from '@services/i18n/languageManager';

export type RenderWithProvidersOptions = {
  /** Initial navigation route; only meaningful when the UI contains a navigator. */
  route?: { name: string; params?: object };
  /** Starting theme. Under the Unistyles jest mock this is a no-op (mock resolves the first theme). */
  theme?: 'light' | 'dark';
  /** Starting language; defaults to `en`. */
  language?: Language;
};

/** Fresh client per test: no retries and an infinite gcTime so data survives until assertions run. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** Renders `ui` inside the app providers and returns RNTL's result plus a `userEvent` instance. */
export async function renderWithProviders(
  ui: ReactElement,
  options: Readonly<RenderWithProvidersOptions> = {},
) {
  const queryClient = createTestQueryClient();
  await initI18nInstance(options.language ?? 'en');
  if (options.theme) {
    UnistylesRuntime.setTheme(options.theme);
  }
  const initialState = options.route ? { routes: [options.route] } : undefined;

  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <NavigationContainer initialState={initialState}>{children}</NavigationContainer>
        </I18nextProvider>
      </QueryClientProvider>
    );
  }

  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient, user: userEvent.setup() };
}
