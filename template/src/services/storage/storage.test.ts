import { z } from 'zod';

import { KEYCHAIN_SERVICES, STORAGE_KEYS } from './keys';
import type * as StorageApi from './storage';

/** Fresh module registry per call so the singleton starts uninitialised, with a test-owned keychain. */
function loadStorage() {
  const entries = new Map<string, { username: string; password: string }>();
  const keychain = {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only' },
    getGenericPassword: jest.fn((options: { service: string }) =>
      Promise.resolve(entries.get(options.service) ?? false),
    ),
    setGenericPassword: jest.fn(
      (username: string, password: string, options: { service: string }) => {
        entries.set(options.service, { username, password });
        return Promise.resolve({ service: options.service });
      },
    ),
  };
  jest.resetModules();
  let module: typeof StorageApi | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-keychain', () => keychain);
    module = jest.requireActual<typeof StorageApi>('./storage');
  });
  if (!module) {
    throw new Error('storage module failed to load');
  }
  return { module, keychain };
}

describe('storage', () => {
  test('AC-3: throws StorageNotReadyError before initStorage', () => {
    const { module } = loadStorage();

    expect(() => module.storage.getString('x')).toThrow(module.StorageNotReadyError);
  });

  test('AC-3: init order: the keychain key is read before the instance exists', async () => {
    const { module, keychain } = loadStorage();

    const init = module.initStorage();
    expect(() => module.storage.getString('x')).toThrow(module.StorageNotReadyError);
    await init;

    expect(keychain.getGenericPassword).toHaveBeenCalledWith({
      service: KEYCHAIN_SERVICES.mmkvKey,
    });
    expect(module.storage.getString('x')).toBeUndefined();
  });

  test('AC-3: creates a 32-char hex key once and reuses it', async () => {
    const { module, keychain } = loadStorage();
    await module.initStorage();
    await module.initStorage();

    const stored = (await keychain.getGenericPassword({
      service: KEYCHAIN_SERVICES.mmkvKey,
    })) as { password: string };
    expect(stored.password).toMatch(/^[0-9a-f]{32}$/);
    expect(keychain.setGenericPassword).toHaveBeenCalledTimes(1);
    expect(keychain.setGenericPassword).toHaveBeenCalledWith(
      'mmkv-encryption-key',
      stored.password,
      expect.objectContaining({ service: KEYCHAIN_SERVICES.mmkvKey }),
    );
  });

  test('AC-3: a keychain failure rejects, then init can be retried', async () => {
    const { module, keychain } = loadStorage();
    keychain.getGenericPassword.mockRejectedValueOnce(new Error('locked'));

    await expect(module.initStorage()).rejects.toThrow('locked');
    await module.initStorage();

    expect(() => module.storage.getString('x')).not.toThrow();
  });

  test('typed getters, JSON validation, remove and clearAll', async () => {
    const { module } = loadStorage();
    const { storage } = module;
    await module.initStorage();
    const schema = z.object({ a: z.number() });

    storage.setString(STORAGE_KEYS.language, 'ar');
    storage.setBoolean(STORAGE_KEYS.onboardingCompleted, true);
    storage.setJSON('obj', { a: 1 });
    storage.setString('bad', '{not json');
    storage.setJSON('mismatch', { a: 'x' });

    expect(storage.getString(STORAGE_KEYS.language)).toBe('ar');
    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBe(true);
    expect(storage.getJSON('obj', schema)).toEqual({ a: 1 });
    expect(storage.getJSON('bad', schema)).toBeUndefined();
    expect(storage.getJSON('mismatch', schema)).toBeUndefined();
    expect(storage.getJSON('missing', schema)).toBeUndefined();

    storage.remove(STORAGE_KEYS.language);
    expect(storage.getString(STORAGE_KEYS.language)).toBeUndefined();
    storage.clearAll();
    expect(storage.getBoolean(STORAGE_KEYS.onboardingCompleted)).toBeUndefined();
  });
});
