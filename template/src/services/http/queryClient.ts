import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

import { isRetryable } from './errors';

const MAX_RETRIES = 2;

/** Retry transient failures (network, timeout, 5xx) twice; never retry 4xx or bugs. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isRetryable(error);
}

/** The app-wide TanStack Query client. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetry,
      refetchOnReconnect: true,
    },
  },
});

let isWired = false;

/** Connects Query's online and focus state to NetInfo and AppState. Safe to call more than once. */
export function wireQueryManagers(): void {
  if (isWired) {
    return;
  }
  isWired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });
    return () => {
      subscription.remove();
    };
  });
}

wireQueryManagers();
