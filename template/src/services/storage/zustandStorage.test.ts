import { initStorage, storage } from './storage';
import { zustandStorage } from './zustandStorage';

describe('zustandStorage', () => {
  test('persists under the zustand. prefix', async () => {
    await initStorage();

    zustandStorage.setItem('settings', '{"a":1}');

    expect(storage.getString('zustand.settings')).toBe('{"a":1}');
    expect(zustandStorage.getItem('settings')).toBe('{"a":1}');
    zustandStorage.removeItem('settings');
    expect(zustandStorage.getItem('settings')).toBeNull();
  });
});
