// Polyfills the React Native runtime lacks and that the MSW interceptors rely on. They are
// dev-only, which is why this file is only ever loaded from index.js behind `__DEV__ && API_MOCKING`.
import 'fast-text-encoding';
import 'react-native-url-polyfill/auto';

import { FetchInterceptor } from '@mswjs/interceptors/fetch';
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest';
import { defineNetwork, InterceptorSource, NetworkReadyState } from 'msw/experimental';

import { handlers } from './handlers';

// msw@3.0.3 documents `msw/native` but does not publish it, so this assembles the same thing from
// the experimental API: fetch + XMLHttpRequest interception only (no Node `http`, no WebSocket).
const network = defineNetwork({
  sources: [
    new InterceptorSource({
      interceptors: [new XMLHttpRequestInterceptor(), new FetchInterceptor()],
    }),
  ],
  handlers,
  onUnhandledFrame: 'bypass',
  context: { quiet: true },
});

/** Starts serving the shared mock API in-app (dev builds with `API_MOCKING=true`). Idempotent. */
export function startNativeMocking(): void {
  if (network.readyState === NetworkReadyState.DISABLED) {
    network.enable();
  }
}

/** Stops intercepting requests. Idempotent. */
export function stopNativeMocking(): void {
  if (network.readyState === NetworkReadyState.ENABLED) {
    network.disable();
  }
}
