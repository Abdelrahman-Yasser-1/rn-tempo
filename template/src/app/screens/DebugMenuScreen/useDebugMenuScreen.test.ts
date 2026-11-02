import { act } from '@testing-library/react-native';

import { useAuthStore } from '@features/auth';
import { clearFlagOverrides, getFlagOverride } from '@services/flags/flagOverrides';
import { queryClient } from '@services/http/queryClient';
import { STORAGE_KEYS } from '@services/storage/keys';
import { initStorage, storage } from '@services/storage/storage';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { FLAG_KEYS, useDebugFlag, useDebugMenuScreen } from './useDebugMenuScreen';

beforeEach(async () => {
  await initStorage();
  storage.clearAll();
  clearFlagOverrides();
});

async function run(action: () => void) {
  await act(() => {
    action();
    return Promise.resolve();
  });
}

describe('useDebugMenuScreen', () => {
  test('starts with the stored API URL override and no done message', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://old.example.test');

    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    expect(result.current.apiUrl).toBe('https://old.example.test');
    expect(result.current.doneMessage).toBe('');
  });

  test('starts with an empty API URL when nothing is stored', async () => {
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    expect(result.current.apiUrl).toBe('');
  });

  test('saving a trimmed URL stores it and reports done', async () => {
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());
    await run(() => {
      result.current.onApiUrlChange('  https://staging.example.test  ');
    });

    await run(result.current.onApiUrlSave);

    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBe('https://staging.example.test');
    expect(result.current.doneMessage).toBe('Done');
  });

  test('saving an empty value removes the override', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://old.example.test');
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());
    await run(() => {
      result.current.onApiUrlChange('   ');
    });

    await run(result.current.onApiUrlSave);

    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBeUndefined();
    expect(result.current.doneMessage).toBe('Done');
  });

  test('clearing removes the override and empties the field', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://old.example.test');
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    await run(result.current.onApiUrlClear);

    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBeUndefined();
    expect(result.current.apiUrl).toBe('');
    expect(result.current.doneMessage).toBe('Done');
  });

  test('clear storage wipes the key-value store', async () => {
    storage.setString(STORAGE_KEYS.apiBaseUrlOverride, 'https://old.example.test');
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    await run(result.current.onClearStorage);

    expect(storage.getString(STORAGE_KEYS.apiBaseUrlOverride)).toBeUndefined();
    expect(result.current.doneMessage).toBe('Done');
  });

  test('clear query cache empties the shared query client', async () => {
    queryClient.setQueryData(['debug-test'], 1);
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    await run(result.current.onClearQueryCache);

    expect(queryClient.getQueryData(['debug-test'])).toBeUndefined();
    expect(result.current.doneMessage).toBe('Done');
  });

  test('clear tokens signs out', async () => {
    const signOutSpy = jest.spyOn(useAuthStore.getState(), 'signOut').mockResolvedValue(undefined);
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    await run(result.current.onClearTokens);

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.doneMessage).toBe('Done');
    signOutSpy.mockRestore();
  });

  test('reset flags removes every local flag override', async () => {
    const [flag] = FLAG_KEYS;
    if (flag === undefined) {
      throw new Error('Expected at least one feature flag');
    }
    const { result: flagResult } = await renderHookWithProviders(() => useDebugFlag(flag));
    await run(() => {
      flagResult.current.onChange(!flagResult.current.isEnabled);
    });
    expect(getFlagOverride(flag)).toBeDefined();
    const { result } = await renderHookWithProviders(() => useDebugMenuScreen());

    await run(result.current.onResetFlags);

    expect(getFlagOverride(flag)).toBeUndefined();
  });
});

describe('useDebugFlag', () => {
  test('onChange stores an override that the hook then reflects', async () => {
    const [flag] = FLAG_KEYS;
    if (flag === undefined) {
      throw new Error('Expected at least one feature flag');
    }
    const { result } = await renderHookWithProviders(() => useDebugFlag(flag));
    const initial = result.current.isEnabled;

    await run(() => {
      result.current.onChange(!initial);
    });

    expect(getFlagOverride(flag)).toBe(!initial);
    expect(result.current.isEnabled).toBe(!initial);
  });
});
