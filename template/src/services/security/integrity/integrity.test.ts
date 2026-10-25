import type * as IntegrityApi from './integrity';

type Scenario = {
  enabled: boolean;
  isDev: boolean;
  isProd: boolean;
  jailbroken?: boolean;
  debugged?: boolean;
  hooked?: boolean;
  os?: 'ios' | 'android';
};

/** Loads a fresh integrity module against a fake env and a fake jail-monkey. */
function loadIntegrity(scenario: Scenario) {
  const jail = {
    isJailBroken: jest.fn(() => scenario.jailbroken ?? false),
    isDebuggedMode: jest.fn(() => Promise.resolve(scenario.debugged ?? false)),
    hookDetected: jest.fn(() => scenario.hooked ?? false),
  };
  jest.resetModules();
  let module: typeof IntegrityApi | undefined;
  jest.isolateModules(() => {
    jest.doMock('jail-monkey', () => ({ __esModule: true, default: jail }));
    jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
      __esModule: true,
      default: {
        OS: scenario.os ?? 'android',
        select: (spec: Record<string, unknown>) => spec[scenario.os ?? 'android'],
      },
    }));
    jest.doMock('@config/env', () => ({
      ENV: { DEVICE_INTEGRITY_ENABLED: scenario.enabled },
      isProd: scenario.isProd,
    }));
    Object.defineProperty(globalThis, '__DEV__', { value: scenario.isDev, configurable: true });
    module = jest.requireActual<typeof IntegrityApi>('./integrity');
  });
  if (!module) {
    throw new Error('integrity module failed to load');
  }
  return { module, jail };
}

afterEach(() => {
  Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
});

describe('runIntegrityPolicy', () => {
  test('AC-6: disabled by env: no checks run', async () => {
    const { module, jail } = loadIntegrity({
      enabled: false,
      isDev: false,
      isProd: true,
      jailbroken: true,
    });

    await expect(module.runIntegrityPolicy()).resolves.toEqual({ shouldBlock: false, reasons: [] });
    expect(jail.isJailBroken).not.toHaveBeenCalled();
  });

  test('AC-6: dev bundles skip the checks even when enabled', async () => {
    const { module, jail } = loadIntegrity({
      enabled: true,
      isDev: true,
      isProd: false,
      jailbroken: true,
    });

    await expect(module.runIntegrityPolicy()).resolves.toEqual({ shouldBlock: false, reasons: [] });
    expect(jail.isJailBroken).not.toHaveBeenCalled();
  });

  test('AC-6: prod + compromised device blocks with the reasons', async () => {
    const { module } = loadIntegrity({
      enabled: true,
      isDev: false,
      isProd: true,
      jailbroken: true,
      debugged: true,
      hooked: true,
    });

    await expect(module.runIntegrityPolicy()).resolves.toEqual({
      shouldBlock: true,
      reasons: ['jailbroken', 'debugMode', 'hookDetected'],
    });
  });

  test('AC-6: non-prod release + compromised device warns but does not block', async () => {
    const { module } = loadIntegrity({
      enabled: true,
      isDev: false,
      isProd: false,
      jailbroken: true,
    });

    await expect(module.runIntegrityPolicy()).resolves.toEqual({
      shouldBlock: false,
      reasons: ['jailbroken'],
    });
  });

  test('AC-6: prod + clean device does not block', async () => {
    const { module } = loadIntegrity({ enabled: true, isDev: false, isProd: true });

    await expect(module.runIntegrityPolicy()).resolves.toEqual({ shouldBlock: false, reasons: [] });
  });

  test('AC-6: hook detection is Android-only', async () => {
    const { module, jail } = loadIntegrity({
      enabled: true,
      isDev: false,
      isProd: true,
      hooked: true,
      os: 'ios',
    });

    await expect(module.checkDeviceIntegrity()).resolves.toEqual({
      isCompromised: false,
      reasons: [],
    });
    expect(jail.hookDetected).not.toHaveBeenCalled();
  });
});
