import { isAndroid, isIOS, select } from './platform';

describe('platform flags', () => {
  it('match the current platform (iOS under the Jest preset)', () => {
    expect(isIOS).toBe(true);
    expect(isAndroid).toBe(false);
  });
});

describe('select', () => {
  it('picks the value for the current platform', () => {
    expect(select({ ios: 'ios-value', android: 'android-value', default: 'fallback' })).toBe(
      'ios-value',
    );
  });

  it('falls back to default when the platform has no entry', () => {
    expect(select({ android: 'android-value', default: 'fallback' })).toBe('fallback');
  });
});
