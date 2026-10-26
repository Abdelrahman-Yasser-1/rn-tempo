import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';

import { ENV } from '@config/env';
import { initI18nInstance } from '@services/i18n/i18n';
import { initStorage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';
import { createTestQueryClient } from '@test-utils/renderWithProviders';

import { AppConfigSchema, DEFAULT_APP_CONFIG } from './appConfig';
import { fetchAppConfig, useAppConfig } from './remoteConfig';

const remote = {
  minSupportedVersion: { ios: '1.0.0', android: '1.0.0' },
  latestVersion: { ios: '2.0.0', android: '2.0.0' },
  maintenance: { enabled: true, message: 'Back soon' },
  flags: { itemsCreateEnabled: false },
  storeUrls: { ios: 'https://apps.example.test/ios', android: 'https://play.example.test/a' },
};
const url = `${ENV.API_BASE_URL}${ENV.APP_CONFIG_PATH}`;

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

describe('fetchAppConfig', () => {
  test('returns the parsed remote config', async () => {
    server.use(http.get(url, () => HttpResponse.json(remote)));

    await expect(fetchAppConfig()).resolves.toEqual(remote);
  });

  test.each([
    ['a 404', () => HttpResponse.json({}, { status: 404 })],
    ['a 500', () => HttpResponse.json({}, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
    ['an invalid body', () => HttpResponse.json({ nope: true })],
  ])('AC-7: %s yields the defaults and never throws', async (_name, resolver) => {
    server.use(http.get(url, resolver));

    await expect(fetchAppConfig()).resolves.toEqual(DEFAULT_APP_CONFIG);
  });

  test('the defaults satisfy the schema', () => {
    expect(AppConfigSchema.safeParse(DEFAULT_APP_CONFIG).success).toBe(true);
  });
});

describe('useAppConfig', () => {
  test('exposes the config through the query cache', async () => {
    server.use(http.get(url, () => HttpResponse.json(remote)));
    const client = createTestQueryClient();
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = await renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(remote);
    });
  });
});
