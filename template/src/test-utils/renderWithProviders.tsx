import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

export type RenderWithProvidersOptions = {
  /** Initial navigation route; only meaningful when the UI contains a navigator. */
  route?: { name: string; params?: object };
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
  const initialState = options.route ? { routes: [options.route] } : undefined;

  function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return (
      <QueryClientProvider client={queryClient}>
        <NavigationContainer initialState={initialState}>{children}</NavigationContainer>
      </QueryClientProvider>
    );
  }

  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient, user: userEvent.setup() };
}
