import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { createElement, type ReactNode } from 'react';

import { ENV } from '@config/env';
import { initI18nInstance } from '@services/i18n/i18n';
import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';
import type * as StorageApi from '@services/storage/storage';
import { initStorage, storage } from '@services/storage/storage';
import { server } from '@test-utils/msw/server';
import { createTestQueryClient } from '@test-utils/renderWithProviders';

import type * as OverridesApi from './flagOverrides';
import { clearFlagOverrides, getFlagOverride, setFlagOverride } from './flagOverrides';
import { FLAG_DEFAULTS } from './flags';
import { resolveFlag, useFeatureFlag } from './useFeatureFlag';

beforeAll(async () => {
  await initStorage();
  await initI18nInstance('en');
});

beforeEach(() => {
  storage.clearAll();
});

describe('resolveFlag', () => {
  test('AC-7: falls back to the code default without config or override', () => {
    expect(resolveFlag('onboardingEnabled', undefined)).toBe(FLAG_DEFAULTS.onboardingEnabled);
    expect(resolveFlag('biometricLoginEnabled', DEFAULT_APP_CONFIG)).toBe(false);
  });

  test('AC-7: remote config beats the default', () => {
    expect(resolveFlag('biometricLoginEnabled', { flags: { biometricLoginEnabled: true } })).toBe(
      true,
    );
    expect(resolveFlag('onboardingEnabled', { flags: { onboardingEnabled: false } })).toBe(false);
  });

  test('AC-7: a local override beats the remote config (non-prod)', () => {
    setFlagOverride('onboardingEnabled', true);

    expect(resolveFlag('onboardingEnabled', { flags: { onboardingEnabled: false } })).toBe(true);
    expect(getFlagOverride('onboardingEnabled')).toBe(true);
  });

  test('AC-7: clearing an override restores the lower layers', () => {
    setFlagOverride('onboardingEnabled', false);
    setFlagOverride('onboardingEnabled', undefined);

    expect(getFlagOverride('onboardingEnabled')).toBeUndefined();
    expect(resolveFlag('onboardingEnabled', undefined)).toBe(true);

    setFlagOverride('itemsCreateEnabled', false);
    clearFlagOverrides();
    expect(getFlagOverride('itemsCreateEnabled')).toBeUndefined();
  });
});

describe('prod builds', () => {
  test('AC-7: overrides are ignored and never written', async () => {
    jest.resetModules();
    jest.doMock('@config/env', () => ({ ENV: {}, isProd: true }));
    const overrides = jest.requireActual<typeof OverridesApi>('./flagOverrides');
    const { storage: freshStorage, initStorage: freshInit } = jest.requireActual<typeof StorageApi>(
      '@services/storage/storage',
    );
    await freshInit();

    overrides.setFlagOverride('onboardingEnabled', false);

    expect(overrides.getFlagOverride('onboardingEnabled')).toBeUndefined();
    expect(freshStorage.getBoolean('flags.override.onboardingEnabled')).toBeUndefined();
    jest.dontMock('@config/env');
  });
});

describe('useFeatureFlag', () => {
  test('AC-7: reflects remote config and reacts to overrides', async () => {
    server.use(
      http.get(`${ENV.API_BASE_URL}${ENV.APP_CONFIG_PATH}`, () =>
        HttpResponse.json({ ...DEFAULT_APP_CONFIG, flags: { itemsCreateEnabled: false } }),
      ),
    );
    const client = createTestQueryClient();
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
      createElement(QueryClientProvider, { client }, children);

    const { result } = await renderHook(() => useFeatureFlag('itemsCreateEnabled'), { wrapper });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    await act(() => {
      setFlagOverride('itemsCreateEnabled', true);
    });

    expect(result.current).toBe(true);
  });
});
