import type * as MMKVApi from 'react-native-mmkv';
import type { MMKV } from 'react-native-mmkv';

import { KEYCHAIN_SERVICES, STORAGE_AREA_IDS } from './keys';
import type * as StorageApi from './storage';

type MMKVFake = {
  createMMKV: jest.Mock<MMKV, [Config]>;
  existsMMKV: jest.Mock<boolean, [string]>;
  deleteMMKV: jest.Mock<boolean, [string]>;
};

type Config = Parameters<typeof MMKVApi.createMMKV>[0];

/** The library's own in-memory instance, so facade calls work on the fake factory. */
const fakeInstance = (config: Config): MMKV =>
  jest.requireActual<typeof MMKVApi>('react-native-mmkv').createMMKV(config);

const warn = jest.fn();

/** Fresh module registry with fakes for MMKV and the keychain, so key loss can be staged. */
function loadStorage({ storedKey, hasFile }: { storedKey?: string; hasFile: boolean }) {
  const entries = new Map<string, { username: string; password: string }>();
  if (storedKey) {
    entries.set(KEYCHAIN_SERVICES.mmkvKey, {
      username: 'mmkv-encryption-key',
      password: storedKey,
    });
  }
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
  const mmkv: MMKVFake = {
    createMMKV: jest.fn<MMKV, [Config]>(fakeInstance),
    existsMMKV: jest.fn<boolean, [string]>(() => hasFile),
    deleteMMKV: jest.fn<boolean, [string]>(() => true),
  };
  jest.resetModules();
  let module: typeof StorageApi | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-keychain', () => keychain);
    jest.doMock('react-native-mmkv', () => mmkv);
    jest.doMock('@services/logger/logger', () => ({ logger: { warn } }));
    module = jest.requireActual<typeof StorageApi>('./storage');
  });
  if (!module) {
    throw new Error('storage module failed to load');
  }
  return { module, keychain, mmkv, entries };
}

describe('storage areas', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('getArea throws StorageNotReadyError before init', () => {
    const { module } = loadStorage({ hasFile: false });

    expect(() => module.getArea('cache').getString('x')).toThrow(module.StorageNotReadyError);
  });

  test('opens every area with its own id and the same AES-256 key', async () => {
    const { module, mmkv, entries } = loadStorage({ hasFile: false });

    await module.initStorage();

    const key = entries.get(KEYCHAIN_SERVICES.mmkvKey)?.password;
    expect(mmkv.createMMKV.mock.calls.map(([config]) => config)).toEqual([
      { id: STORAGE_AREA_IDS.app, encryptionKey: key, encryptionType: 'AES-256' },
      { id: STORAGE_AREA_IDS.cache, encryptionKey: key, encryptionType: 'AES-256' },
    ]);
    expect(mmkv.deleteMMKV).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test('a fresh install (new key, no file) opens without deleting anything', async () => {
    const { module, mmkv } = loadStorage({ hasFile: false });

    await module.initStorage();

    expect(mmkv.deleteMMKV).not.toHaveBeenCalled();
  });

  test('a lost key with files left behind deletes them, recreates them and warns', async () => {
    const { module, mmkv } = loadStorage({ hasFile: true });

    await module.initStorage();

    expect(mmkv.deleteMMKV.mock.calls).toEqual([[STORAGE_AREA_IDS.app], [STORAGE_AREA_IDS.cache]]);
    expect(mmkv.createMMKV).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(() => module.getArea('app').getString('x')).not.toThrow();
  });

  test('an existing key keeps the files', async () => {
    const { module, mmkv } = loadStorage({ storedKey: 'k'.repeat(32), hasFile: true });

    await module.initStorage();

    expect(mmkv.deleteMMKV).not.toHaveBeenCalled();
    expect(mmkv.createMMKV).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  test('an area that fails to open is deleted and recreated once', async () => {
    const { module, mmkv } = loadStorage({ storedKey: 'k'.repeat(32), hasFile: true });
    mmkv.createMMKV.mockImplementationOnce(() => {
      throw new Error('cannot decrypt');
    });

    await module.initStorage();

    expect(mmkv.deleteMMKV.mock.calls).toEqual([[STORAGE_AREA_IDS.app]]);
    expect(mmkv.createMMKV).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('init rejects when the area still cannot open after a reset, and can be retried', async () => {
    const { module, mmkv } = loadStorage({ storedKey: 'k'.repeat(32), hasFile: true });
    mmkv.createMMKV.mockImplementation(() => {
      throw new Error('disk full');
    });

    await expect(module.initStorage()).rejects.toThrow('disk full');

    mmkv.createMMKV.mockImplementation(fakeInstance);
    await module.initStorage();

    expect(() => module.getArea('app').getString('x')).not.toThrow();
  });
});
