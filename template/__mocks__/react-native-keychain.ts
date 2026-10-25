/**
 * Stateful in-memory keychain, shaped like react-native-keychain 10, so stores can be
 * exercised end to end. Reset between tests via `resetKeychainMock()` (called by jest.setup.ts).
 */
type Entry = { username: string; password: string };

const DEFAULT_SERVICE = 'mock-default-service';
const store = new Map<string, Entry>();

type ServiceOptions = { service?: string };

const serviceOf = (options?: ServiceOptions): string => options?.service ?? DEFAULT_SERVICE;

export const ACCESSIBLE = {
  WHEN_UNLOCKED: 'MOCK_AccessibleWhenUnlocked',
  AFTER_FIRST_UNLOCK: 'MOCK_AccessibleAfterFirstUnlock',
  ALWAYS: 'MOCK_AccessibleAlways',
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'MOCK_AccessibleWhenPasscodeSetThisDeviceOnly',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'MOCK_AccessibleWhenUnlockedThisDeviceOnly',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'MOCK_AccessibleAfterFirstUnlockThisDeviceOnly',
} as const;

export const setGenericPassword = jest.fn(
  (username: string, password: string, options?: ServiceOptions) => {
    const service = serviceOf(options);
    store.set(service, { username, password });
    return Promise.resolve({ service, storage: 'mockStorage' });
  },
);

export const getGenericPassword = jest.fn((options?: ServiceOptions) => {
  const service = serviceOf(options);
  const entry = store.get(service);
  return Promise.resolve(entry ? { ...entry, service, storage: 'mockStorage' } : false);
});

export const resetGenericPassword = jest.fn((options?: ServiceOptions) =>
  Promise.resolve(store.delete(serviceOf(options))),
);

/** Test helper: wipes every stored credential. */
export function resetKeychainMock(): void {
  store.clear();
}
