import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { logger } from '@services/logger/logger';

import { createPersistOptions } from './persist';
import { initStorage, storage } from './storage';

type V2State = { fullName: string; theme: string };

const migrations = {
  1: (state: unknown) => ({ ...(state as object), theme: 'light' }),
  2: (state: unknown) => {
    const { name, ...rest } = state as { name: string };
    return { ...rest, fullName: name };
  },
};

describe('createPersistOptions', () => {
  beforeAll(async () => {
    await initStorage();
  });

  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
  });

  afterEach(() => {
    storage.clearAll();
    jest.restoreAllMocks();
  });

  function migrate(
    options: { version: number; migrations?: Record<number, (s: unknown) => unknown> },
    state: unknown,
    from: number,
  ) {
    const result = createPersistOptions<V2State>({ name: 'profile', ...options });
    return result.migrate?.(state, from);
  }

  test('exposes the name, version and the MMKV-backed JSON storage', () => {
    const options = createPersistOptions<V2State>({ name: 'profile', version: 2 });

    expect(options.name).toBe('profile');
    expect(options.version).toBe(2);
    expect(options.storage).toBeDefined();
  });

  test('runs every step from the persisted version up to the current one in order', () => {
    const result = migrate({ version: 2, migrations }, { name: 'Ada' }, 0);

    expect(result).toEqual({ fullName: 'Ada', theme: 'light' });
  });

  test('runs only the steps after the persisted version', () => {
    const result = migrate({ version: 2, migrations }, { name: 'Ada', theme: 'dark' }, 1);

    expect(result).toEqual({ fullName: 'Ada', theme: 'dark' });
  });

  test('passes the state through when the version is unchanged', () => {
    const state = { fullName: 'Ada', theme: 'dark' };

    expect(migrate({ version: 2, migrations }, state, 2)).toBe(state);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('discards the state and warns when a step throws', () => {
    const failing = {
      1: () => {
        throw new Error('corrupt');
      },
    };

    const result = migrate({ version: 1, migrations: failing }, { name: 'Ada' }, 0);

    expect(result).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('discards the state and warns when a step is missing', () => {
    const result = migrate({ version: 2, migrations: { 1: migrations[1] } }, { name: 'Ada' }, 0);

    expect(result).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('discards a state written by a newer app version', () => {
    const result = migrate({ version: 1, migrations }, { name: 'Ada' }, 5);

    expect(result).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test('a store hydrates migrated state and keeps its initial state after a failed migration', async () => {
    storage.setString('zustand.profile', JSON.stringify({ state: { name: 'Ada' }, version: 0 }));
    const useStore = create<V2State>()(
      persist(() => ({ fullName: '', theme: 'system' }), {
        ...createPersistOptions<V2State>({ name: 'profile', version: 2, migrations }),
      }),
    );
    await useStore.persist.rehydrate();

    expect(useStore.getState()).toEqual({ fullName: 'Ada', theme: 'light' });

    storage.setString('zustand.profile', JSON.stringify({ state: { name: 'Ada' }, version: 9 }));
    await useStore.persist.rehydrate();

    expect(useStore.getState()).toEqual({ fullName: 'Ada', theme: 'light' });
  });

  test('partialize is forwarded', () => {
    const partialize = (state: V2State) => ({ theme: state.theme });
    const options = createPersistOptions<V2State, { theme: string }>({
      name: 'profile',
      version: 1,
      partialize,
    });

    expect(options.partialize).toBe(partialize);
  });
});
