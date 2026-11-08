import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { ApiError } from '@services/http/errors';
import { request } from '@services/http/request';
import { server } from '@test-utils/msw/server';

const PingSchema = z.object({ pong: z.boolean() });

function createClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Smoke test for TanStack Query v5 against the real stack: a real QueryClient and observers, the
// app `request()` (axios + Zod) and MSW answering at the network edge.
describe('integration: @tanstack/react-query', () => {
  test('fetches through request() and MSW and caches the result under its key', async () => {
    server.use(http.get('*/integration/ping', () => HttpResponse.json({ pong: true })));
    const client = createClient();

    const { result } = await renderHook(
      () =>
        useQuery({
          queryKey: ['integration', 'ping'],
          queryFn: () => request({ url: '/integration/ping' }, PingSchema),
        }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ pong: true });
    expect(client.getQueryData(['integration', 'ping'])).toEqual({ pong: true });
  });

  test('surfaces a server failure as an ApiError in the query state', async () => {
    server.use(
      http.get('*/integration/ping', () => HttpResponse.json({ message: 'nope' }, { status: 404 })),
    );

    const { result } = await renderHook(
      () =>
        useQuery({
          queryKey: ['integration', 'missing'],
          queryFn: () => request({ url: '/integration/ping' }, PingSchema),
        }),
      { wrapper: wrapperFor(createClient()) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeInstanceOf(ApiError);
  });
});
