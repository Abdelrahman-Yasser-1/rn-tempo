import { DEFAULT_APP_CONFIG } from '@services/remote-config/appConfig';

import { createBootstrapSteps, runBootstrap, type BootstrapSteps } from './bootstrap';
import { orderSteps } from './stepGraph';

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
    initFallbackI18n: track('initFallbackI18n', Promise.resolve()),
    initSecurity: track('initSecurity', Promise.resolve({ isSafe: true, reasons: [] })),
    initAuth: track('initAuth', Promise.resolve()),
    initRemoteConfig: track('initRemoteConfig', Promise.resolve(DEFAULT_APP_CONFIG)),
    initPush: track('initPush', Promise.resolve()), // @tempo-feature:push-notifications
    evaluateGate: track('evaluateGate', 'open' as const),
    hideSplash: track('hideSplash', Promise.resolve()),
    ...overrides,
  };
  return { steps, calls };
}

describe('bootstrap step graph', () => {
  test('is valid: known dependencies, no cycle, and the planned order', () => {
    const { steps } = createSteps();

    const ordered = orderSteps(createBootstrapSteps(steps));

    expect(ordered.map((step) => step.id)).toEqual([
      'storage',
      'theme',
      'i18n',
      'security',
      'auth',
      'remote-config',
      'push', // @tempo-feature:push-notifications
    ]);
  });

  test('declares the failure policy of every step', () => {
    const { steps } = createSteps();

    const policies = Object.fromEntries(
      createBootstrapSteps(steps).map((step) => [step.id, step.onError]),
    );

    expect(policies).toEqual({
      storage: 'fatal',
      theme: 'continue',
      i18n: 'fatal',
      security: 'block-security',
      auth: 'fatal',
      'remote-config': 'continue',
      push: 'continue', // @tempo-feature:push-notifications
    });
  });
});

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
      'initPush', // @tempo-feature:push-notifications
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
    expect(calls).toEqual(['initFallbackI18n', 'hideSplash']);
  });

  test('AC-8: a failing fallback i18n does not change the blocked result', async () => {
    const { steps } = createSteps({
      initStorage: jest.fn(() => Promise.reject(new Error('keychain'))),
      initFallbackI18n: jest.fn(() => Promise.reject(new Error('i18n'))),
    });

    await expect(runBootstrap(steps)).resolves.toMatchObject({ blockReason: 'startupError' });
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

// @tempo-feature:push-notifications:start
describe('push step', () => {
  test('a push failure never stops startup', async () => {
    const { steps } = createSteps({ initPush: jest.fn(() => Promise.reject(new Error('fcm'))) });

    await expect(runBootstrap(steps)).resolves.toEqual({ status: 'ready' });
  });

  test('push does not start when the app is blocked by the version gate', async () => {
    const { steps, calls } = createSteps({ evaluateGate: jest.fn(() => 'maintenance' as const) });

    await expect(runBootstrap(steps)).resolves.toMatchObject({ blockReason: 'maintenance' });
    expect(calls).not.toContain('initPush');
  });
});
// @tempo-feature:push-notifications:end
