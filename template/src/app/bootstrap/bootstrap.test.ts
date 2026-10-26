import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';

import { runBootstrap, type BootstrapSteps } from './bootstrap';

function createSteps(overrides: Partial<BootstrapSteps> = {}) {
  const calls: string[] = [];
  const track = <T>(name: string, value: T) =>
    jest.fn(() => {
      calls.push(name);
      return value;
    });
  const steps: BootstrapSteps = {
    initStorage: track('initStorage', Promise.resolve()),
    initTheme: track('initTheme', undefined),
    initI18n: track('initI18n', Promise.resolve()),
    initSecurity: track('initSecurity', Promise.resolve({ isSafe: true, reasons: [] })),
    initAuth: track('initAuth', Promise.resolve()),
    initRemoteConfig: track('initRemoteConfig', Promise.resolve(DEFAULT_APP_CONFIG)),
    evaluateGate: track('evaluateGate', 'open' as const),
    hideSplash: track('hideSplash', Promise.resolve()),
    ...overrides,
  };
  return { steps, calls };
}

describe('runBootstrap', () => {
  test('AC-8: runs the steps in the planned order and hides the splash last', async () => {
    const { steps, calls } = createSteps();

    await expect(runBootstrap(steps)).resolves.toEqual({ status: 'ready' });

    expect(calls).toEqual([
      'initStorage',
      'initTheme',
      'initI18n',
      'initSecurity',
      'initAuth',
      'initRemoteConfig',
      'evaluateGate',
      'hideSplash',
    ]);
  });

  test('AC-8: a storage failure blocks with startupError and skips everything but the splash', async () => {
    const { steps, calls } = createSteps({
      initStorage: jest.fn(() => Promise.reject(new Error('keychain'))),
    });

    await expect(runBootstrap(steps)).resolves.toEqual({
      status: 'blocked',
      blockReason: 'startupError',
      securityReasons: undefined,
    });
    expect(calls).toEqual(['hideSplash']);
  });

  test('AC-8: a theme failure is non-fatal', async () => {
    const { steps } = createSteps({
      initTheme: jest.fn(() => {
        throw new Error('theme');
      }),
    });

    await expect(runBootstrap(steps)).resolves.toEqual({ status: 'ready' });
  });

  test('AC-8: an i18n failure blocks with startupError', async () => {
    const { steps, calls } = createSteps({
      initI18n: jest.fn(() => Promise.reject(new Error('i18n'))),
    });

    await expect(runBootstrap(steps)).resolves.toMatchObject({
      status: 'blocked',
      blockReason: 'startupError',
    });
    expect(calls).not.toContain('initSecurity');
  });

  test('AC-8: an unsafe security result blocks before any network step runs', async () => {
    const { steps, calls } = createSteps({
      initSecurity: jest.fn(() =>
        Promise.resolve({ isSafe: false, reasons: ['jailbroken' as const] }),
      ),
    });

    await expect(runBootstrap(steps)).resolves.toEqual({
      status: 'blocked',
      blockReason: 'security',
      securityReasons: ['jailbroken'],
    });
    expect(calls).not.toContain('initAuth');
    expect(calls).not.toContain('initRemoteConfig');
    expect(calls).toContain('hideSplash');
  });

  test('AC-8: a crashing security check fails closed', async () => {
    const { steps } = createSteps({
      initSecurity: jest.fn(() => Promise.reject(new Error('native'))),
    });

    await expect(runBootstrap(steps)).resolves.toMatchObject({
      status: 'blocked',
      blockReason: 'security',
    });
  });

  test('AC-8: an auth failure blocks with startupError', async () => {
    const { steps } = createSteps({ initAuth: jest.fn(() => Promise.reject(new Error('boom'))) });

    await expect(runBootstrap(steps)).resolves.toMatchObject({
      status: 'blocked',
      blockReason: 'startupError',
    });
  });

  test.each([['forceUpdate' as const], ['maintenance' as const]])(
    'AC-8: gate result %s blocks',
    async (gate) => {
      const { steps } = createSteps({ evaluateGate: jest.fn(() => gate) });

      await expect(runBootstrap(steps)).resolves.toMatchObject({
        status: 'blocked',
        blockReason: gate,
      });
    },
  );

  test('AC-8: a remote config failure never blocks startup', async () => {
    const { steps } = createSteps({
      initRemoteConfig: jest.fn(() => Promise.reject(new Error('cfg'))),
    });

    await expect(runBootstrap(steps)).resolves.toEqual({ status: 'ready' });
  });

  test('AC-8: a splash failure does not change the outcome', async () => {
    const { steps } = createSteps({
      hideSplash: jest.fn(() => Promise.reject(new Error('splash'))),
    });

    await expect(runBootstrap(steps)).resolves.toEqual({ status: 'ready' });
  });
});
