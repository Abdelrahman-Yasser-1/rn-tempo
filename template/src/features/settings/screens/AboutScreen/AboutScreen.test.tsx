import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS } from '../../constants';

import { AboutScreen } from './AboutScreen';

const mockNavigate = jest.fn<undefined, [string]>();

jest.mock('@navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (name: string) => {
      mockNavigate(name);
    },
  },
}));

type AboutProps = ComponentProps<typeof AboutScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

async function renderAbout(navigation = makeNavigation()) {
  const props = { navigation, route: { key: 'About', name: 'About' } } as unknown as AboutProps;
  return renderWithProviders(<AboutScreen {...props} />);
}

/** Presses the version row once, then lets `gapMs` of fake time pass before the next press. */
async function tapVersion(gapMs: number) {
  // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent returns an act promise
  await fireEvent.press(screen.getByText('Version'));
  await act(() => {
    jest.advanceTimersByTime(gapMs);
  });
}

describe('AboutScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    mockNavigate.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('shows the version, environment, React Native and OS rows', async () => {
    await renderAbout();

    expect(screen.getByText('Version')).toBeOnTheScreen();
    expect(screen.getByText('Environment')).toBeOnTheScreen();
    expect(screen.getByText('React Native')).toBeOnTheScreen();
    expect(screen.getByText('Operating system')).toBeOnTheScreen();
  });

  test('AC-4: tapping the version label 5 times within 3 s opens the debug menu', async () => {
    await renderAbout();

    for (let index = 0; index < SECRET_TAP_COUNT; index += 1) {
      await tapVersion(500);
    }

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('DebugMenu');
  });

  test('AC-4: four taps do not open the debug menu', async () => {
    await renderAbout();

    for (let index = 0; index < SECRET_TAP_COUNT - 1; index += 1) {
      await tapVersion(500);
    }

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('AC-4: slow taps, each outside the 3 s window, do not open the debug menu', async () => {
    await renderAbout();

    // Each tap is 1.1 s apart, so no 5 taps ever fit inside the 3 s window.
    for (let index = 0; index < SECRET_TAP_COUNT; index += 1) {
      await tapVersion(1100);
    }

    expect(SECRET_TAP_COUNT * 1100).toBeGreaterThan(SECRET_TAP_WINDOW_MS);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
