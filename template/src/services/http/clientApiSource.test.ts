import { http, HttpResponse } from 'msw';
import type * as reactNative from 'react-native';

import { ENV } from '@config/env';
import type * as storageModule from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import type * as client from './client';
import type * as errors from './errors';

type Client = typeof client;
type StorageModule = typeof storageModule;

/**
 * Runs `use` against a fresh copy of the client and storage: the base URL is chosen once
 * per launch, and the client loads its dev-only modules lazily, so it must be used inside the scope.
 */
async function launch(
  setup: (storage: StorageModule['storage']) => void,
  use: (client: Client) => Promise<void> | void,
  os: 'ios' | 'android' = 'ios',
): Promise<void> {
  await jest.isolateModulesAsync(async () => {
    // The copy has its own `react-native`, so the platform is set on that one.
    jest.replaceProperty(jest.requireActual<typeof reactNative>('react-native').Platform, 'OS', os);
    const { initStorage, storage } = jest.requireActual<StorageModule>('@services/storage/storage');
    await initStorage();
    storage.clearAll();
    setup(storage);
    await use(jest.requireActual<Client>('./client'));
  });
}

describe('API source in the http client', () => {
  test("env: today's behavior (ENV.API_BASE_URL over the network)", async () => {
    server.use(http.get(`${ENV.API_BASE_URL}/ping`, () => HttpResponse.json({ from: 'env' })));

    await launch(
      () => {
        // nothing stored: the build default
      },
      async (client) => {
        expect(client.resolveBaseUrl()).toBe(ENV.API_BASE_URL);
        expect((await client.httpClient.get<{ from: string }>('/ping')).data.from).toBe('env');
      },
    );
  });

  test('env keeps the base URL override', async () => {
    await launch(
      (storage) => {
        storage.setString('app.api-base-url-override', 'https://staging.example.test');
      },
      (client) => {
        expect(client.resolveBaseUrl()).toBe('https://staging.example.test');
      },
    );
  });

  test('backend on iOS: requests go to https://localhost:8443', async () => {
    server.use(
      http.get('https://localhost:8443/ping', () => HttpResponse.json({ from: 'backend' })),
    );

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'backend');
      },
      async (client) => {
        expect(client.resolveBaseUrl()).toBe('https://localhost:8443');
        expect((await client.httpClient.get<{ from: string }>('/ping')).data.from).toBe('backend');
      },
    );
  });

  test('a network failure on the Tempo backend is marked, so the UI explains what to check', async () => {
    server.use(http.get('https://localhost:8443/ping', () => HttpResponse.error()));

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'backend');
      },
      async (client) => {
        const { getErrorMessageKey } = jest.requireActual<typeof errors>('./errors');
        const failure: unknown = await client.httpClient
          .get('/ping')
          .catch((error: unknown) => error);
        expect(getErrorMessageKey(failure)).toBe('networkDevBackend');
      },
    );
  });

  test('a network failure on the env API keeps the usual offline message', async () => {
    server.use(http.get(`${ENV.API_BASE_URL}/ping`, () => HttpResponse.error()));

    await launch(
      () => {
        // nothing stored: the build default
      },
      async (client) => {
        const { getErrorMessageKey } = jest.requireActual<typeof errors>('./errors');
        const failure: unknown = await client.httpClient
          .get('/ping')
          .catch((error: unknown) => error);
        expect(getErrorMessageKey(failure)).toBe('network');
      },
    );
  });

  test('backend on Android defaults to the emulator host alias', async () => {
    await launch(
      (storage) => {
        storage.setString('app.api-source', 'backend');
      },
      (client) => {
        expect(client.resolveBaseUrl()).toBe('https://10.0.2.2:8443');
      },
      'android',
    );
  });

  test('backend uses the stored URL, and beats the base URL override', async () => {
    server.use(http.get('https://192.168.1.20:8443/ping', () => HttpResponse.json({ ok: true })));

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'backend');
        storage.setString('app.backend-url', 'https://192.168.1.20:8443');
        storage.setString('app.api-base-url-override', 'https://staging.example.test');
      },
      async (client) => {
        expect(client.resolveBaseUrl()).toBe('https://192.168.1.20:8443');
        expect((await client.httpClient.get<{ ok: boolean }>('/ping')).data.ok).toBe(true);
      },
    );
  });
});
