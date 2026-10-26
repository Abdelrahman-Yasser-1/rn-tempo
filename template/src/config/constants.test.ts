import { version } from '../../package.json';

import { APP_BUNDLE_ID, APP_VERSION } from './constants';

describe('constants', () => {
  test('APP_VERSION is inlined from package.json by the babel plugin', () => {
    expect(APP_VERSION).toBe(version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('APP_BUNDLE_ID is the prod bundle id', () => {
    expect(APP_BUNDLE_ID).toBe('com.rntempo.app');
  });
});
