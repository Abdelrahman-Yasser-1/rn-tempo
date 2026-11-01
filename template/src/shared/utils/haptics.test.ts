import { Vibration } from 'react-native';

import { haptics } from './haptics';

// The platform flag is read at call time, so each describe block picks the platform it needs.
const mockPlatform = { isIOS: true };

jest.mock('./platform', () => ({
  get isIOS() {
    return mockPlatform.isIOS;
  },
}));

function spyOnVibrate() {
  const vibrate = jest.spyOn(Vibration, 'vibrate');
  // The Jest preset already mocks Vibration.vibrate, so clear calls left by earlier tests.
  vibrate.mockClear();
  return vibrate;
}

describe('haptics on iOS', () => {
  beforeEach(() => {
    mockPlatform.isIOS = true;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('plays a system vibration without a duration', () => {
    const vibrate = spyOnVibrate();
    haptics.light();
    haptics.medium();
    haptics.error();
    expect(vibrate.mock.calls).toEqual([[undefined], [undefined], [undefined]]);
  });
});

describe('haptics on Android', () => {
  beforeEach(() => {
    mockPlatform.isIOS = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('vibrates with a duration per feedback level', () => {
    const vibrate = spyOnVibrate();
    haptics.light();
    haptics.medium();
    haptics.error();
    expect(vibrate.mock.calls).toEqual([[10], [20], [[0, 40, 60, 40]]]);
  });
});
