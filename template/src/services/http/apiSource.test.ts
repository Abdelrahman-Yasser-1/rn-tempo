import { Platform } from 'react-native';

import { initStorage, storage } from '@services/storage/storage';

import {
  API_SOURCE_KEY,
  DEV_API_URL_KEY,
  defaultDevApiUrl,
  isApiSource,
  readApiSource,
  readDevApiUrl,
  writeApiSource,
  writeDevApiUrl,
} from './apiSource';

beforeAll(async () => {
  await initStorage();
});

beforeEach(() => {
  storage.clearAll();
});

describe('apiSource storage', () => {
  test('uses the documented MMKV keys', () => {
    expect(API_SOURCE_KEY).toBe('app.api-source');
    expect(DEV_API_URL_KEY).toBe('app.dev-api-url');
  });

  test('defaults to env, and ignores a stored value that is not a source', () => {
    expect(readApiSource()).toBe('env');
    storage.setString(API_SOURCE_KEY, 'nonsense');
    expect(readApiSource()).toBe('env');
  });

  test('stores mocks and dev-api, and removes the key for env', () => {
    writeApiSource('mocks');
    expect(storage.getString(API_SOURCE_KEY)).toBe('mocks');
    writeApiSource('dev-api');
    expect(readApiSource()).toBe('dev-api');
    writeApiSource('env');
    expect(storage.getString(API_SOURCE_KEY)).toBeUndefined();
  });

  test('knows which values are sources', () => {
    expect(['env', 'mocks', 'dev-api'].every(isApiSource)).toBe(true);
    expect(isApiSource('prod')).toBe(false);
    expect(isApiSource(undefined)).toBe(false);
  });

  test('the dev API URL defaults per platform', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(defaultDevApiUrl()).toBe('https://localhost:8443');
    expect(readDevApiUrl()).toBe('https://localhost:8443');
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(defaultDevApiUrl()).toBe('https://10.0.2.2:8443');
    expect(readDevApiUrl()).toBe('https://10.0.2.2:8443');
  });

  test('a stored dev API URL wins, trimmed; an empty one restores the default', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    writeDevApiUrl('  https://192.168.1.20:8443  ');
    expect(readDevApiUrl()).toBe('https://192.168.1.20:8443');
    writeDevApiUrl('   ');
    expect(storage.getString(DEV_API_URL_KEY)).toBeUndefined();
    expect(readDevApiUrl()).toBe('https://localhost:8443');
  });
});
