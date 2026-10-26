import { Platform } from 'react-native';

import { DEFAULT_APP_CONFIG, type AppConfig } from '@services/remote-config/appConfig';

import { evaluateGate } from './versionGate';

const config = (patch: Partial<AppConfig>): AppConfig => ({ ...DEFAULT_APP_CONFIG, ...patch });

describe('evaluateGate', () => {
  test('AC-8: opens with default config', () => {
    expect(evaluateGate(DEFAULT_APP_CONFIG, '1.0.0')).toBe('open');
  });

  test.each(['ios', 'android'] as const)(
    'AC-8: on %s, an app below the minimum is forced to update',
    (os) => {
      jest.replaceProperty(Platform, 'OS', os);
      const minSupportedVersion = { ios: '2.0.0', android: '2.0.0' };

      expect(evaluateGate(config({ minSupportedVersion }), '1.9.9')).toBe('forceUpdate');
      expect(evaluateGate(config({ minSupportedVersion }), '2.0.0')).toBe('open');
    },
  );

  test('AC-8: only the running platform minimum applies', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const minSupportedVersion = { ios: '1.0.0', android: '9.0.0' };

    expect(evaluateGate(config({ minSupportedVersion }), '1.0.0')).toBe('open');
  });

  test('AC-8: maintenance blocks when the version is fine', () => {
    expect(evaluateGate(config({ maintenance: { enabled: true } }), '1.0.0')).toBe('maintenance');
  });

  test('AC-8: force update wins over maintenance', () => {
    const gate = evaluateGate(
      config({
        maintenance: { enabled: true },
        minSupportedVersion: { ios: '9.0.0', android: '9.0.0' },
      }),
      '1.0.0',
    );

    expect(gate).toBe('forceUpdate');
  });
});
