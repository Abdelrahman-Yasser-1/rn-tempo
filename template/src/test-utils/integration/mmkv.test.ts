import { z } from 'zod';

import { initStorage, storage } from '@services/storage/storage';

// Smoke test for react-native-mmkv 4 behind the `@services/storage` facade. Under Jest the library
// hands out its own in-memory implementation, which is the one an upgrade could break. The
// facade needs the keychain key first, so `initStorage()` is part of the flow.
describe('integration: react-native-mmkv', () => {
  beforeAll(async () => {
    await initStorage();
  });

  afterEach(() => {
    storage.clearAll();
  });

  test('stores and reads strings and booleans', () => {
    storage.setString('integration.text', 'hello');
    storage.setBoolean('integration.flag', true);

    expect(storage.getString('integration.text')).toBe('hello');
    expect(storage.getBoolean('integration.flag')).toBe(true);
    expect(storage.getString('integration.missing')).toBeUndefined();
  });

  test('round-trips JSON through a schema and drops mismatched data', () => {
    const schema = z.object({ count: z.number() });
    storage.setJSON('integration.json', { count: 2 });

    expect(storage.getJSON('integration.json', schema)).toEqual({ count: 2 });

    storage.setJSON('integration.json', { count: 'two' });

    expect(storage.getJSON('integration.json', schema)).toBeUndefined();
  });

  test('removes one key and clears everything', () => {
    storage.setString('integration.a', 'a');
    storage.setString('integration.b', 'b');

    storage.remove('integration.a');

    expect(storage.getString('integration.a')).toBeUndefined();
    expect(storage.getString('integration.b')).toBe('b');

    storage.clearAll();

    expect(storage.getString('integration.b')).toBeUndefined();
  });
});
