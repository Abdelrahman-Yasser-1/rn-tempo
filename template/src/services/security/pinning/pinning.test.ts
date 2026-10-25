import type * as PinningApi from './pinning';

type EnvOverrides = {
  SSL_PINNING_ENABLED?: boolean;
  SSL_PINS?: string[];
  API_BASE_URL?: string;
  isProd?: boolean;
};

/** Loads a fresh pinning module against a fake env and a fake native pinning library. */
function loadPinning(overrides: EnvOverrides = {}, isAvailable = true) {
  const native = {
    isSslPinningAvailable: jest.fn(() => isAvailable),
    initializeSslPinning: jest.fn(() => Promise.resolve()),
    addSslPinningErrorListener: jest.fn<undefined, [(error: { serverHostname: string }) => void]>(),
  };
  jest.resetModules();
  let module: typeof PinningApi | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native-ssl-public-key-pinning', () => native);
    jest.doMock('@config/env', () => ({
      ENV: {
        SSL_PINNING_ENABLED: overrides.SSL_PINNING_ENABLED ?? true,
        SSL_PINS: overrides.SSL_PINS ?? ['sha256/AAA=', 'BBB='],
        API_BASE_URL: overrides.API_BASE_URL ?? 'https://api.example.test/v1',
      },
      isProd: overrides.isProd ?? false,
    }));
    module = jest.requireActual<typeof PinningApi>('./pinning');
  });
  if (!module) {
    throw new Error('pinning module failed to load');
  }
  return { module, native };
}

const onSecurityCompromised = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initPinning', () => {
  test('AC-6: enabled: pins the API host with normalized pins and subdomains', async () => {
    const { module, native } = loadPinning();

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(true);

    expect(native.initializeSslPinning).toHaveBeenCalledWith({
      'api.example.test': { includeSubdomains: true, publicKeyHashes: ['AAA=', 'BBB='] },
    });
    expect(module.isPinningReady()).toBe(true);
  });

  test('AC-6: a pin mismatch reports the compromise', async () => {
    const { module, native } = loadPinning();
    await module.initPinning({ onSecurityCompromised });
    const listener = native.addSslPinningErrorListener.mock.calls[0]?.[0];

    listener?.({ serverHostname: 'api.example.test' });

    expect(onSecurityCompromised).toHaveBeenCalledWith('ssl');
  });

  test('AC-6: disabled in dev: ready without touching the native module', async () => {
    const { module, native } = loadPinning({ SSL_PINNING_ENABLED: false });

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(true);

    expect(native.initializeSslPinning).not.toHaveBeenCalled();
    expect(module.isPinningReady()).toBe(true);
  });

  test('AC-6: disabled in prod fails closed', async () => {
    const { module } = loadPinning({ SSL_PINNING_ENABLED: false, isProd: true });

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(false);

    expect(module.isPinningReady()).toBe(false);
  });

  test('AC-6: enabled but native module unavailable fails closed', async () => {
    const { module } = loadPinning({}, false);

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(false);
    expect(module.isPinningReady()).toBe(false);
  });

  test('AC-6: an initialization error fails closed', async () => {
    const { module, native } = loadPinning();
    native.initializeSslPinning.mockRejectedValueOnce(new Error('bad pins'));

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(false);
    expect(module.isPinningReady()).toBe(false);
  });

  test('AC-6: an unparsable API URL fails closed', async () => {
    const { module } = loadPinning({ API_BASE_URL: 'not a url' });

    await expect(module.initPinning({ onSecurityCompromised })).resolves.toBe(false);
  });

  test('AC-6: concurrent and repeated calls initialize once', async () => {
    const { module, native } = loadPinning();

    await Promise.all([
      module.initPinning({ onSecurityCompromised }),
      module.initPinning({ onSecurityCompromised }),
    ]);
    await module.initPinning({ onSecurityCompromised });

    expect(native.initializeSslPinning).toHaveBeenCalledTimes(1);
  });
});
