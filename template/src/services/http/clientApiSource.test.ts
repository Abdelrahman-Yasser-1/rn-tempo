import { http, HttpResponse } from 'msw';
import type * as reactNative from 'react-native';

import { ENV } from '@config/env';
import type * as storageModule from '@services/storage/storage';
import { server } from '@test-utils/msw/server';

import type * as client from './client';

type Client = typeof client;
type StorageModule = typeof storageModule;

/**
 * Runs `use` against a fresh copy of the client and storage: the adapter and base URL are chosen once
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
    jest.replaceProperty(ENV, 'API_MOCKING', false);
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

  test('mocks: the in-app mock adapter answers even when API_MOCKING is false, with no network call', async () => {
    jest.replaceProperty(ENV, 'API_MOCKING', false);
    const seen = jest.fn();
    server.events.on('request:start', seen);

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'mocks');
      },
      async (client) => {
        const response = await client.httpClient.get<{ id: number }>('/products/1');
        expect(response.data.id).toBe(1);
      },
    );

    expect(seen).not.toHaveBeenCalled();
    server.events.removeAllListeners();
  });

  test('dev-api on iOS: requests go to https://localhost:8443 and never to the mock adapter', async () => {
    jest.replaceProperty(ENV, 'API_MOCKING', true);
    server.use(
      http.get('https://localhost:8443/ping', () => HttpResponse.json({ from: 'dev-api' })),
    );

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'dev-api');
      },
      async (client) => {
        expect(client.resolveBaseUrl()).toBe('https://localhost:8443');
        expect((await client.httpClient.get<{ from: string }>('/ping')).data.from).toBe('dev-api');
      },
    );
  });

  test('dev-api on Android defaults to the emulator host alias', async () => {
    await launch(
      (storage) => {
        storage.setString('app.api-source', 'dev-api');
      },
      (client) => {
        expect(client.resolveBaseUrl()).toBe('https://10.0.2.2:8443');
      },
      'android',
    );
  });

  test('dev-api uses the stored URL, and beats the base URL override', async () => {
    server.use(http.get('https://192.168.1.20:8443/ping', () => HttpResponse.json({ ok: true })));

    await launch(
      (storage) => {
        storage.setString('app.api-source', 'dev-api');
        storage.setString('app.dev-api-url', 'https://192.168.1.20:8443');
        storage.setString('app.api-base-url-override', 'https://staging.example.test');
      },
      async (client) => {
        expect(client.resolveBaseUrl()).toBe('https://192.168.1.20:8443');
        expect((await client.httpClient.get<{ ok: boolean }>('/ping')).data.ok).toBe(true);
      },
    );
  });
});
