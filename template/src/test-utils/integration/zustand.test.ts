import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { initStorage, storage } from '@services/storage/storage';
import { zustandStorage } from '@services/storage/zustandStorage';

type CounterState = { count: number; increment: () => void };

function createCounterStore() {
  return create<CounterState>()(
    persist(
      (set) => ({
        count: 0,
        increment: () => {
          set((state) => ({ count: state.count + 1 }));
        },
      }),
      {
        name: 'integration-counter',
        storage: createJSONStorage(() => zustandStorage),
        partialize: ({ count }) => ({ count }),
      },
    ),
  );
}

// Smoke test for zustand 5 and its persist middleware writing through `zustandStorage` (encrypted
// MMKV, keys prefixed `zustand.`): update, persist, and hydrate a brand new store from storage.
describe('integration: zustand', () => {
  beforeAll(async () => {
    await initStorage();
  });

  afterEach(() => {
    storage.clearAll();
  });

  test('updates state and persists only the partialized slice', () => {
    const useStore = createCounterStore();

    useStore.getState().increment();
    useStore.getState().increment();

    expect(useStore.getState().count).toBe(2);
    const raw = storage.getString('zustand.integration-counter');
    expect(JSON.parse(raw ?? '{}')).toEqual({ state: { count: 2 }, version: 0 });
  });

  test('a new store hydrates from the persisted value', async () => {
    createCounterStore().getState().increment();

    const next = createCounterStore();
    await next.persist.rehydrate();

    expect(next.getState().count).toBe(1);
  });
});
