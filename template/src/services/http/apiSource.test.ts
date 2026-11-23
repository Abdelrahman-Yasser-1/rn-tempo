import { Platform } from 'react-native';

import { initStorage, storage } from '@services/storage/storage';

import {
  API_SOURCE_KEY,
  BACKEND_URL_KEY,
  defaultBackendUrl,
  isApiSource,
  readApiSource,
  readBackendUrl,
  writeApiSource,
  writeBackendUrl,
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
    expect(BACKEND_URL_KEY).toBe('app.backend-url');
  });

  test('defaults to env, and ignores a stored value that is not a source', () => {
    expect(readApiSource()).toBe('env');
    storage.setString(API_SOURCE_KEY, 'nonsense');
    expect(readApiSource()).toBe('env');
  });

  test('stores backend, and removes the key for env', () => {
    writeApiSource('backend');
    expect(readApiSource()).toBe('backend');
    writeApiSource('env');
    expect(storage.getString(API_SOURCE_KEY)).toBeUndefined();
  });

  test('knows which values are sources', () => {
    expect(['env', 'backend'].every(isApiSource)).toBe(true);
    expect(isApiSource('prod')).toBe(false);
    expect(isApiSource(undefined)).toBe(false);
  });

  test('the backend URL defaults per platform', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(defaultBackendUrl()).toBe('https://localhost:8443');
    expect(readBackendUrl()).toBe('https://localhost:8443');
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(defaultBackendUrl()).toBe('https://10.0.2.2:8443');
    expect(readBackendUrl()).toBe('https://10.0.2.2:8443');
  });

  test('a stored backend URL wins, trimmed; an empty one restores the default', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    writeBackendUrl('  https://192.168.1.20:8443  ');
    expect(readBackendUrl()).toBe('https://192.168.1.20:8443');
    writeBackendUrl('   ');
    expect(storage.getString(BACKEND_URL_KEY)).toBeUndefined();
    expect(readBackendUrl()).toBe('https://localhost:8443');
  });
});
